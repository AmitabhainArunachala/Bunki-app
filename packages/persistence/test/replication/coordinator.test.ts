import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

import {
  operationReference,
  type ReplicaPolicy,
  type SyncBinding,
  type SyncOperation,
} from '@bunki/sync';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SyncCoordinator,
  SqliteReplicationStore,
  type AuthenticatedSyncSession,
  type ReplicationStore,
  type SyncPushAcknowledgement,
  type SyncPushRequest,
  type SyncPullPage,
  type SyncPullRequest,
  type SyncSessionCapture,
} from '../../src/replication/index.ts';
import { openNodeSqliteDriver } from '../../src/sqlite/node-driver.ts';
import { FaultDriver, POLICY, RECEIVE_FAULTS, WHEN, note } from './fixtures.ts';

const PHONE: ReplicaPolicy = {
  ...POLICY,
  binding: { ...POLICY.binding, sessionId: 'phone-login' },
};
const CHANNEL = 'synthetic-authenticated-relay';
let directory: string;
let stores: SqliteReplicationStore[];

beforeEach(async () => {
  const base =
    env['KAIRO_EVIDENCE_DIR'] ??
    join(homedir(), '.dharma', 'test-runtime', 'replication-coordinator');
  await mkdir(base, { recursive: true });
  directory = await mkdtemp(join(base, 'sqlite-'));
  stores = [];
});
afterEach(async () => {
  for (const store of stores) await store.close();
  await rm(directory, { recursive: true, force: true });
});

function open(name: string, policy = name === 'mac' ? POLICY : PHONE) {
  const location = join(directory, `${name}.sqlite`);
  const driver = new FaultDriver(openNodeSqliteDriver({ location }));
  const store = SqliteReplicationStore.open(driver, {
    policy,
    actor: { deviceId: name, incarnationId: `synthetic-install-${name}` },
  });
  stores.push(store);
  return { store, driver, location };
}
async function append(store: ReplicationStore, version: string, text = version) {
  const snapshot = await store.snapshot();
  await store.commitLocal({
    changeId: version,
    binding: snapshot.policy.binding,
    expectedRevision: snapshot.revision,
    occurredAt: WHEN,
    mutations: [
      {
        kind: 'put',
        collection: 'private',
        id: 'not-a-sync-payload',
        value: {
          fullBody: `LOCAL_ONLY_BODY_${version}`,
          credentials: 'LOCAL_ONLY_SYNTHETIC_CREDENTIAL',
        },
      },
    ],
    operations: [{ payload: note(version, text), dependencies: [] }],
  });
  const next = await store.snapshot();
  return next.replica.operations.find((row) => row.opId === next.actor.predecessor?.opId)!;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function facade(store: ReplicationStore, overrides: Partial<ReplicationStore>): ReplicationStore {
  return {
    snapshot: () => store.snapshot(),
    commitLocal: (request) => store.commitLocal(request),
    commitReceive: (request) => store.commitReceive(request),
    commitRestore: (request) => store.commitRestore(request),
    acknowledgeOutbox: (request) => store.acknowledgeOutbox(request),
    replaceSession: (revision, binding) => store.replaceSession(revision, binding),
    close: () => store.close(),
    ...overrides,
  };
}

/** Deterministic transport stand-in. A private test grant, not account/device
 * text in a request, admits calls. It is deliberately not a live auth service.
 */
class SyntheticRelay {
  readonly grants = new WeakSet<object>();
  readonly accepted = new Map<string, SyncOperation>();
  readonly pushes: SyncPushRequest[] = [];
  readonly pulls: SyncPullRequest[] = [];
  journal: SyncOperation[] = [];
  offline = false;
  losePushAck = false;
  acceptCount = Infinity;
  pushReply: ((value: SyncPushAcknowledgement) => unknown) | null = null;
  pullReply: ((value: SyncPullPage) => unknown) | null = null;

  push(grant: object, request: SyncPushRequest): unknown {
    if (!this.grants.has(grant)) throw new Error('not authorized');
    this.pushes.push(request);
    if (this.offline) throw new Error('OFFLINE_WITH_SYNTHETIC_PRIVATE_DIAGNOSTIC');
    const accepted = request.operations.slice(0, this.acceptCount);
    for (const operation of accepted) {
      expect(operation.scope).toEqual({
        accountId: request.binding.accountId,
        learnerId: request.binding.learnerId,
      });
      const prior = this.accepted.get(operation.opId);
      if (prior) expect(operationReference(operation)).toEqual(operationReference(prior));
      else {
        this.accepted.set(operation.opId, operation);
        this.journal.push(operation);
      }
    }
    if (this.losePushAck) {
      this.losePushAck = false;
      throw new Error('ACK_LOST_AFTER_REMOTE_ACCEPT');
    }
    const response: SyncPushAcknowledgement = {
      requestId: request.requestId,
      binding: request.binding,
      channelId: request.channelId,
      accepted: accepted.map(operationReference),
    };
    return this.pushReply ? this.pushReply(response) : response;
  }
  pull(grant: object, request: SyncPullRequest): unknown {
    if (!this.grants.has(grant)) throw new Error('not authorized');
    this.pulls.push(request);
    if (this.offline) throw new Error('OFFLINE_WITH_SYNTHETIC_PRIVATE_DIAGNOSTIC');
    const cursor = request.checkpoint === null ? 0 : Number(request.checkpoint);
    const operations = this.journal.slice(cursor, cursor + request.limit);
    const next = cursor + operations.length;
    const response: SyncPullPage = {
      requestId: request.requestId,
      binding: request.binding,
      channelId: request.channelId,
      previous: request.checkpoint,
      next: operations.length ? String(next) : request.checkpoint,
      operations,
      hasMore: next < this.journal.length,
    };
    return this.pullReply ? this.pullReply(response) : response;
  }
}
class SyntheticSession implements AuthenticatedSyncSession {
  readonly #grant = {};
  epoch = 7;
  active = true;
  afterPush: (() => Promise<void>) | null = null;
  afterPull: (() => Promise<void>) | null = null;
  constructor(
    readonly binding: SyncBinding,
    readonly relay: SyntheticRelay,
  ) {
    relay.grants.add(this.#grant);
  }
  capture(): SyncSessionCapture {
    return { binding: this.binding, channelId: CHANNEL, epoch: this.epoch };
  }
  assertCurrent(captured: SyncSessionCapture): boolean {
    return (
      this.active &&
      captured.epoch === this.epoch &&
      captured.channelId === CHANNEL &&
      JSON.stringify(captured.binding) === JSON.stringify(this.binding)
    );
  }
  async push(capture: SyncSessionCapture, request: SyncPushRequest, _signal: AbortSignal) {
    if (!this.assertCurrent(capture)) throw new Error('synthetic auth revoked');
    const response = this.relay.push(this.#grant, request);
    await this.afterPush?.();
    return response;
  }
  async pull(capture: SyncSessionCapture, request: SyncPullRequest, _signal: AbortSignal) {
    if (!this.assertCurrent(capture)) throw new Error('synthetic auth revoked');
    const response = this.relay.pull(this.#grant, request);
    await this.afterPull?.();
    return response;
  }
}
function coordinator(
  store: ReplicationStore,
  relay: SyntheticRelay,
  policy = POLICY,
  options: Partial<ConstructorParameters<typeof SyncCoordinator>[0]> = {},
) {
  const session = new SyntheticSession(policy.binding, relay);
  const sync = new SyncCoordinator({ store, session, ...options });
  return { sync, session };
}

function projection(snapshot: Awaited<ReturnType<ReplicationStore['snapshot']>>) {
  return {
    operations: snapshot.replica.operations,
    ready: snapshot.replica.ready,
    pending: snapshot.replica.pending,
    quarantined: snapshot.replica.quarantined,
    projection: snapshot.replica.projection,
  };
}

describe('sync coordinator — two real file-backed node:sqlite stores (ci-substitute)', () => {
  it('converges typed operations, retains concurrent choices, and never transmits local document roots', async () => {
    const mac = open('mac');
    const phone = open('phone');
    const relay = new SyntheticRelay();
    await append(mac.store, 'mac-note', '猫を見た。');
    await append(phone.store, 'phone-note', '犬を見た。');
    const a = coordinator(mac.store, relay);
    const b = coordinator(phone.store, relay, PHONE);
    await a.sync.syncOnce();
    await b.sync.syncOnce();
    const last = await a.sync.syncOnce();
    const [one, two] = await Promise.all([mac.store.snapshot(), phone.store.snapshot()]);
    expect(projection(one)).toEqual(projection(two));
    expect(one.replica.projection.entities[0]).toMatchObject({ requiresChoice: true });
    expect(one.replica.projection.entities[0]?.heads).toHaveLength(2);
    expect(one.replica.projection.scheduling).toBe('not-computed');
    expect(one.documents).not.toEqual(two.documents);
    expect(JSON.stringify(relay.pushes)).not.toContain('LOCAL_ONLY');
    expect(last).toMatchObject({
      pendingOutbox: 0,
      pendingCausal: 0,
      hasMore: false,
      checkpoint: '2',
    });
    expect(two.outbox).toEqual([]);
    expect((await stat(mac.location)).size).toBeGreaterThan(0);
    expect((await stat(phone.location)).size).toBeGreaterThan(0);
    await mac.store.close();
    await phone.store.close();
    expect(projection(await open('mac').store.snapshot())).toEqual(projection(one));
    expect(projection(await open('phone').store.snapshot())).toEqual(projection(two));
  });

  it('makes one bounded push and pull per call and leaves remaining work explicit', async () => {
    const a = open('mac').store;
    const b = open('phone').store;
    const relay = new SyntheticRelay();
    for (let index = 0; index < 5; index++) await append(a, `version-${index}`);
    const first = coordinator(a, relay, POLICY, { pushLimit: 2, pullLimit: 2 });
    expect(await first.sync.syncOnce()).toMatchObject({ pendingOutbox: 3, hasMore: true });
    expect(relay.pushes).toHaveLength(1);
    expect(relay.pulls).toHaveLength(1);
    await first.sync.syncOnce();
    await first.sync.syncOnce();
    const second = coordinator(b, relay, PHONE, { pullLimit: 2 });
    expect(await second.sync.syncOnce()).toMatchObject({ checkpoint: '2', hasMore: true });
    await second.sync.syncOnce();
    expect(await second.sync.syncOnce()).toMatchObject({ checkpoint: '5', hasMore: false });
    expect(projection(await b.snapshot())).toEqual(projection(await a.snapshot()));
    expect(relay.pushes.every((request) => request.operations.length <= 2)).toBe(true);
  });

  it('preserves offline work and retries lost remote acknowledgement with identical operation identities', async () => {
    const store = open('mac').store;
    const relay = new SyntheticRelay();
    await append(store, 'offline');
    const { sync } = coordinator(store, relay);
    const before = await store.snapshot();
    relay.offline = true;
    await expect(sync.syncOnce()).rejects.toMatchObject({
      code: 'transport-failed',
      message: 'Sync coordinator: transport-failed',
    });
    expect(await store.snapshot()).toEqual(before);
    relay.offline = false;
    relay.losePushAck = true;
    await expect(sync.syncOnce()).rejects.toMatchObject({ code: 'transport-failed' });
    expect(await store.snapshot()).toEqual(before);
    expect(relay.journal).toHaveLength(1);
    await sync.syncOnce();
    expect(relay.pushes[1]).toEqual(relay.pushes[2]);
    expect(relay.journal).toHaveLength(1);
    expect((await store.snapshot()).outbox).toHaveLength(0);
  });

  it('acknowledges only the exact accepted subset; a received local echo is not an acknowledgement', async () => {
    const store = open('mac').store;
    const relay = new SyntheticRelay();
    const one = await append(store, 'one');
    await append(store, 'two');
    relay.acceptCount = 0;
    relay.journal = [one];
    const { sync } = coordinator(store, relay);
    expect(await sync.syncOnce()).toMatchObject({ acknowledged: [], pendingOutbox: 2 });
    relay.acceptCount = 1;
    const next = await sync.syncOnce();
    expect(next.acknowledged).toHaveLength(1);
    expect(next.pendingOutbox).toBe(1);
    expect((await store.snapshot()).acknowledgedOutbox).toEqual(next.acknowledged);
  });

  it.each([
    'wrong-digest',
    'unknown-ref',
    'duplicate',
    'request',
    'account',
    'learner',
    'session',
    'channel',
    'extra',
  ])('rejects %s in a push acknowledgement before clearing any outbox row', async (kind) => {
    const store = open('mac').store;
    const relay = new SyntheticRelay();
    await append(store, 'one');
    const before = await store.snapshot();
    relay.pushReply = (reply) => {
      const ref = reply.accepted[0]!;
      if (kind === 'wrong-digest')
        return { ...reply, accepted: [{ ...ref, sha256: '0'.repeat(64) }] };
      if (kind === 'unknown-ref') return { ...reply, accepted: [{ ...ref, opId: '0'.repeat(64) }] };
      if (kind === 'duplicate') return { ...reply, accepted: [ref, ref] };
      if (kind === 'request') return { ...reply, requestId: 'other' };
      if (kind === 'channel') return { ...reply, channelId: 'other' };
      if (kind === 'extra') return { ...reply, privateRecord: { secret: 'unexpected' } };
      const field =
        kind === 'account' ? 'accountId' : kind === 'learner' ? 'learnerId' : 'sessionId';
      return { ...reply, binding: { ...reply.binding, [field]: 'other' } };
    };
    await expect(coordinator(store, relay).sync.syncOnce()).rejects.toMatchObject({
      code: 'invalid-response',
    });
    expect(await store.snapshot()).toEqual(before);
    expect(relay.pulls).toHaveLength(0);
  });

  it('uses the existing causal planner for reordered and duplicate arrivals', async () => {
    const a = open('mac').store;
    const b = open('phone').store;
    const relay = new SyntheticRelay();
    const one = await append(a, 'one');
    const two = await append(a, 'two');
    relay.journal = [two, two, one];
    const { sync } = coordinator(b, relay, PHONE, { pullLimit: 1 });
    expect(await sync.syncOnce()).toMatchObject({ pendingCausal: 1, checkpoint: '1' });
    expect((await b.snapshot()).replica.ready).toHaveLength(0);
    await sync.syncOnce();
    expect((await b.snapshot()).replica.operations).toHaveLength(1);
    expect(await sync.syncOnce()).toMatchObject({ pendingCausal: 0, checkpoint: '3' });
    expect(projection(await b.snapshot())).toEqual(projection(await a.snapshot()));
    expect((await b.snapshot()).outbox).toEqual([]);
  });

  it.each(Object.entries(RECEIVE_FAULTS))(
    'atomically rolls back receive and checkpoint after real SQLite %s writes',
    async (_, boundary) => {
      const a = open('mac').store;
      const b = open('phone');
      const relay = new SyntheticRelay();
      relay.journal = [await append(a, 'incoming')];
      const before = await b.store.snapshot();
      b.driver.armed = boundary;
      const { sync } = coordinator(b.store, relay, PHONE);
      await expect(sync.syncOnce()).rejects.toThrow('SYNTHETIC_SQLITE_DRIVER_FAULT');
      expect(b.driver.fired).toBe(true);
      expect(await b.store.snapshot()).toEqual(before);
      await sync.syncOnce();
      const after = await b.store.snapshot();
      expect(after.checkpoints).toEqual([{ channelId: CHANNEL, value: '1' }]);
      expect(after.inbox).toHaveLength(1);
      expect(after.replica.operations).toHaveLength(1);
    },
  );

  it('reopens after a lost local receive acknowledgement without replaying or losing a committed page', async () => {
    const a = open('mac').store;
    const b = open('phone');
    const relay = new SyntheticRelay();
    relay.journal = [await append(a, 'incoming')];
    const wrapped = facade(b.store, {
      commitReceive: (request) => {
        b.driver.failCommit = 'after';
        return b.store.commitReceive(request);
      },
    });
    await expect(coordinator(wrapped, relay, PHONE).sync.syncOnce()).rejects.toThrow(
      'SYNTHETIC_SQLITE_DRIVER_FAULT',
    );
    expect(b.driver.fired).toBe(true);
    await expect(b.store.snapshot()).rejects.toMatchObject({ code: 'reopen-required' });
    await b.store.close();
    const restored = open('phone').store;
    const before = await restored.snapshot();
    expect(before.checkpoints).toEqual([{ channelId: CHANNEL, value: '1' }]);
    expect(before.replica.operations).toHaveLength(1);
    expect(await coordinator(restored, relay, PHONE).sync.syncOnce()).toMatchObject({
      received: [],
      checkpoint: '1',
    });
    expect(await restored.snapshot()).toEqual(before);
  });

  it.each(['before', 'after'] as const)(
    'recovers a failed local outbox acknowledgement %s native COMMIT without duplicating remote operations',
    async (phase) => {
      const a = open('mac');
      const relay = new SyntheticRelay();
      await append(a.store, 'one');
      const wrapped = facade(a.store, {
        acknowledgeOutbox: (request) => {
          a.driver.failCommit = phase;
          return a.store.acknowledgeOutbox(request);
        },
      });
      await expect(coordinator(wrapped, relay).sync.syncOnce()).rejects.toThrow(
        'SYNTHETIC_SQLITE_DRIVER_FAULT',
      );
      expect(a.driver.fired).toBe(true);
      expect(relay.journal).toHaveLength(1);
      await expect(a.store.snapshot()).rejects.toMatchObject({ code: 'reopen-required' });
      await a.store.close();
      const restored = open('mac').store;
      expect((await restored.snapshot()).outbox).toHaveLength(phase === 'before' ? 1 : 0);
      await coordinator(restored, relay).sync.syncOnce();
      expect(relay.journal).toHaveLength(1);
      expect((await restored.snapshot()).outbox).toEqual([]);
      expect((await restored.snapshot()).acknowledgedOutbox).toHaveLength(1);
    },
  );

  it('refreshes revisions after concurrent local edits and retries only proven stale-revision failures', async () => {
    const a = open('mac').store;
    const relay = new SyntheticRelay();
    await append(a, 'first');
    let raced = false;
    const wrapped = facade(a, {
      acknowledgeOutbox: async (request) => {
        if (!raced) {
          raced = true;
          await append(a, 'while-acknowledging');
        }
        return a.acknowledgeOutbox(request);
      },
    });
    const { sync, session } = coordinator(wrapped, relay);
    session.afterPush = async () => {
      await append(a, 'while-sending');
    };
    const result = await sync.syncOnce();
    expect(raced).toBe(true);
    expect(result.acknowledged).toHaveLength(1);
    expect(result.pendingOutbox).toBe(2);
    expect((await a.snapshot()).replica.operations).toHaveLength(3);
    expect(relay.pushes).toHaveLength(1);
  });

  it('bounds revision retries without resending or swallowing a contention failure', async () => {
    const a = open('mac').store;
    const relay = new SyntheticRelay();
    await append(a, 'first');
    let races = 0;
    const wrapped = facade(a, {
      acknowledgeOutbox: async (request) => {
        await append(a, `racer-${++races}`);
        return a.acknowledgeOutbox(request);
      },
    });
    await expect(
      coordinator(wrapped, relay, POLICY, { revisionRetries: 1 }).sync.syncOnce(),
    ).rejects.toMatchObject({ code: 'stale-revision' });
    expect(races).toBe(2);
    expect(relay.pushes).toHaveLength(1);
    expect((await a.snapshot()).acknowledgedOutbox).toEqual([]);
  });

  it('cancels a noncooperative transport, refuses simultaneous cycles, and ignores the late acknowledgement', async () => {
    const a = open('mac').store;
    const relay = new SyntheticRelay();
    await append(a, 'one');
    const { sync, session } = coordinator(a, relay);
    const started = deferred();
    const release = deferred();
    session.afterPush = async () => {
      started.resolve();
      await release.promise;
    };
    const controller = new AbortController();
    const run = sync.syncOnce({ signal: controller.signal });
    await started.promise;
    await expect(sync.syncOnce()).rejects.toMatchObject({ code: 'busy' });
    controller.abort();
    await expect(run).rejects.toMatchObject({ code: 'cancelled' });
    expect((await a.snapshot()).outbox).toHaveLength(1);
    release.resolve();
    await Promise.resolve();
    expect((await a.snapshot()).outbox).toHaveLength(1);
    session.afterPush = null;
    await sync.syncOnce();
    expect(relay.journal).toHaveLength(1);
    expect((await a.snapshot()).outbox).toEqual([]);
  });

  it.each(['push', 'pull'] as const)(
    'rejects a revoked authenticated session after %s returns',
    async (phase) => {
      const a = open('mac').store;
      const b = open('phone').store;
      const relay = new SyntheticRelay();
      const one = await append(a, 'one');
      const store = phase === 'push' ? a : b;
      if (phase === 'pull') relay.journal = [one];
      const { sync, session } = coordinator(store, relay, phase === 'push' ? POLICY : PHONE);
      const before = await store.snapshot();
      session[phase === 'push' ? 'afterPush' : 'afterPull'] = async () => {
        session.epoch++;
      };
      await expect(sync.syncOnce()).rejects.toMatchObject({ code: 'stale-session' });
      expect(await store.snapshot()).toEqual(before);
    },
  );

  it('rejects absent authority, inactive grants and authenticated bindings that do not match the store', async () => {
    const store = open('mac').store;
    const relay = new SyntheticRelay();
    expect(
      () =>
        new SyncCoordinator({
          store,
          session: POLICY.binding as unknown as AuthenticatedSyncSession,
        }),
    ).toThrow('session-required');
    const noGrant = coordinator(store, relay);
    noGrant.session.active = false;
    await expect(noGrant.sync.syncOnce()).rejects.toMatchObject({ code: 'stale-session' });
    await expect(coordinator(store, relay, PHONE).sync.syncOnce()).rejects.toMatchObject({
      code: 'binding-mismatch',
    });
    expect(relay.pushes).toEqual([]);
    expect(relay.pulls).toEqual([]);
  });

  it('cannot reuse an old store binding when the durable session changes during transport', async () => {
    const a = open('mac').store;
    const relay = new SyntheticRelay();
    await append(a, 'one');
    const { sync, session } = coordinator(a, relay);
    const replacement = {
      ...POLICY,
      binding: { ...POLICY.binding, sessionId: 'replacement-login' },
    };
    session.afterPush = async () => {
      await a.replaceSession((await a.snapshot()).revision, replacement.binding);
    };
    await expect(sync.syncOnce()).rejects.toMatchObject({ code: 'stale-session' });
    await a.close();
    const current = await open('mac', replacement).store.snapshot();
    expect(current.outbox).toHaveLength(1);
    expect(current.acknowledgedOutbox).toEqual([]);
  });

  it('refuses an in-flight page when another receive advanced its channel checkpoint', async () => {
    const a = open('mac').store;
    const b = open('phone').store;
    const relay = new SyntheticRelay();
    const incoming = await append(a, 'one');
    relay.journal = [incoming];
    const { sync, session } = coordinator(b, relay, PHONE);
    session.afterPull = async () => {
      const current = await b.snapshot();
      await b.commitReceive({
        deliveryId: 'other-receiver',
        expectedRevision: current.revision,
        delivery: { binding: PHONE.binding, operations: [incoming] },
        checkpoint: { channelId: CHANNEL, expected: null, next: 'other-checkpoint' },
      });
    };
    await expect(sync.syncOnce()).rejects.toMatchObject({ code: 'checkpoint-changed' });
    const current = await b.snapshot();
    expect(current.checkpoints).toEqual([{ channelId: CHANNEL, value: 'other-checkpoint' }]);
    expect(current.replica.operations).toHaveLength(1);
  });

  it.each(['binding', 'request', 'previous', 'extra', 'no-progress', 'oversize', 'too-many'])(
    'rejects a %s pull response without touching operations or checkpoint',
    async (kind) => {
      const a = open('mac').store;
      const b = open('phone').store;
      const relay = new SyntheticRelay();
      relay.journal = [await append(a, 'incoming')];
      const before = await b.snapshot();
      relay.pullReply = (page) => {
        if (kind === 'binding') return { ...page, binding: POLICY.binding };
        if (kind === 'request') return { ...page, requestId: 'other' };
        if (kind === 'previous') return { ...page, previous: 'other' };
        if (kind === 'extra') return { ...page, record: { private: true } };
        if (kind === 'no-progress') return { ...page, next: null };
        if (kind === 'oversize') return { ...page, next: 'a'.repeat(8193) };
        return { ...page, operations: [...page.operations, ...page.operations] };
      };
      await expect(
        coordinator(b, relay, PHONE, { pullLimit: 1 }).sync.syncOnce(),
      ).rejects.toMatchObject({ code: 'invalid-response' });
      expect(await b.snapshot()).toEqual(before);
    },
  );

  it('bounds wire bytes without discarding an oversized pending operation', async () => {
    const a = open('mac').store;
    const relay = new SyntheticRelay();
    await append(a, 'large', '字'.repeat(500));
    const before = await a.snapshot();
    await expect(
      coordinator(a, relay, POLICY, { maxBytes: 1024 }).sync.syncOnce(),
    ).rejects.toMatchObject({ code: 'batch-too-large' });
    expect(relay.pushes).toEqual([]);
    expect(await a.snapshot()).toEqual(before);
    const b = open('phone').store;
    relay.journal = before.outbox.slice();
    const otherBefore = await b.snapshot();
    await expect(
      coordinator(b, relay, PHONE, { maxBytes: 1024 }).sync.syncOnce(),
    ).rejects.toMatchObject({ code: 'invalid-response' });
    expect(await b.snapshot()).toEqual(otherBefore);
  });

  it('sends a fitting prefix when the count limit would exceed the wire byte limit', async () => {
    const a = open('mac').store;
    const relay = new SyntheticRelay();
    for (let index = 0; index < 3; index++) await append(a, `sized-${index}`, 'x'.repeat(800));
    relay.pullReply = (page) => ({ ...page, next: null, operations: [], hasMore: false });
    const result = await coordinator(a, relay, POLICY, { maxBytes: 2600 }).sync.syncOnce();
    expect(result.offered).toHaveLength(1);
    expect(result.pendingOutbox).toBe(2);
    expect(
      new TextEncoder().encode(JSON.stringify(relay.pushes[0])).byteLength,
    ).toBeLessThanOrEqual(2600);
  });

  it('does not send a checkpoint request larger than its wire budget', async () => {
    const store = open('mac').store;
    const relay = new SyntheticRelay();
    await store.commitReceive({
      deliveryId: 'long-cursor',
      expectedRevision: 0,
      delivery: { binding: POLICY.binding, operations: [] },
      checkpoint: { channelId: CHANNEL, expected: null, next: 'c'.repeat(1500) },
    });
    const before = await store.snapshot();
    await expect(
      coordinator(store, relay, POLICY, { maxBytes: 1024 }).sync.syncOnce(),
    ).rejects.toMatchObject({ code: 'batch-too-large' });
    expect(relay.pulls).toEqual([]);
    expect(await store.snapshot()).toEqual(before);
  });

  it('reports cancellation after an already submitted receive settles, without claiming it rolled back', async () => {
    const a = open('mac').store;
    const b = open('phone').store;
    const relay = new SyntheticRelay();
    relay.journal = [await append(a, 'one')];
    const started = deferred();
    const release = deferred();
    const wrapped = facade(b, {
      commitReceive: async (request) => {
        started.resolve();
        await release.promise;
        return b.commitReceive(request);
      },
    });
    const { sync } = coordinator(wrapped, relay, PHONE);
    const run = sync.syncOnce();
    await started.promise;
    sync.cancel();
    release.resolve();
    await expect(run).rejects.toMatchObject({ code: 'cancelled' });
    expect((await b.snapshot()).replica.operations).toHaveLength(1);
    expect((await b.snapshot()).checkpoints).toEqual([{ channelId: CHANNEL, value: '1' }]);
    expect(await coordinator(b, relay, PHONE).sync.syncOnce()).toMatchObject({
      received: [],
      checkpoint: '1',
    });
  });

  it('does no work when already cancelled and exposes explicit cancellation without leaking transport diagnostics', async () => {
    const a = open('mac').store;
    const relay = new SyntheticRelay();
    const { sync, session } = coordinator(a, relay);
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(sync.syncOnce({ signal: cancelled.signal })).rejects.toMatchObject({
      code: 'cancelled',
    });
    expect(relay.pulls).toEqual([]);
    const started = deferred();
    const release = deferred();
    session.afterPull = async () => {
      started.resolve();
      await release.promise;
    };
    const run = sync.syncOnce();
    await started.promise;
    sync.cancel();
    await expect(run).rejects.toMatchObject({ code: 'cancelled' });
    release.resolve();
    expect((await a.snapshot()).checkpoints).toEqual([]);
  });
});
