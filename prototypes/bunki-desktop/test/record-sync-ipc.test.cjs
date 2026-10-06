'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { stageDesktopHost } = require('../tools/host-stage.cjs');

const root = path.resolve(__dirname, '../../..');
const parent = path.join(os.homedir(), '.dharma', 'bunki', 'record-sync-ipc-tests');
fs.mkdirSync(parent, { recursive: true });
const evidence = fs.mkdtempSync(path.join(parent, 'run-'));
let host;
let fixtures;
test.before(async () => {
  const staged = await stageDesktopHost({ root, output: path.join(evidence, 'host') });
  host = require(path.join(staged.hostSource, 'lib/record-sync-ipc.cjs'));
  await require(path.join(root, 'node_modules/esbuild')).build({
    stdin: { contents: "export { POLICY, local, remote } from './packages/persistence/test/replication/fixtures.ts'; export { operationReference } from './packages/sync/src/index.ts'; export { SqliteReplicationStore } from './packages/persistence/src/replication/sqlite.ts'; export { openNodeSqliteDriver } from './packages/persistence/src/sqlite/node-driver.ts';", resolveDir: root },
    outfile: path.join(evidence, 'storage-fixture.cjs'), bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
  });
  fixtures = require(path.join(evidence, 'storage-fixture.cjs'));
});

async function scenario(t, { configuration = { profileLabel: 'Synthetic learner' }, launch, storeReply, storeTimeoutMs = 2000 } = {}) {
  const frame = { frameToken: 'synthetic-frame-a', detached: false, parent: null,
    origin: 'http://localhost:5198', url: 'http://localhost:5198/' };
  frame.top = frame;
  const contents = Object.assign(new EventEmitter(), { mainFrame: frame, isDestroyed: () => false,
    isLoadingMainFrame: () => false, getURL: () => frame.url });
  const window = Object.assign(new EventEmitter(), { webContents: contents, isDestroyed: () => false });
  let alive = false;
  let started = 0;
  let pulled = 0;
  const capture = { binding: fixtures.POLICY.binding, channelId: 'synthetic-native-channel', epoch: 1 };
  const remote = fixtures.remote('phone-note');
  const session = {
    capture: () => { assert(alive); return capture; }, assertCurrent: () => alive,
    push: async (_capture, request) => ({ requestId: request.requestId, binding: request.binding,
      channelId: request.channelId, accepted: request.operations.map(fixtures.operationReference) }),
    pull: async (_capture, request) => { pulled += 1; return { requestId: request.requestId, binding: request.binding,
      channelId: request.channelId, previous: request.checkpoint, next: 'synthetic-cursor',
      operations: request.checkpoint === null ? [remote] : [], hasMore: false }; },
  };
  let lease;
  const owner = { beginDocument: () => ({}), attach: () => { alive = true; return session; }, revoke: () => { alive = false; } };
  const store = fixtures.SqliteReplicationStore.open(fixtures.openNodeSqliteDriver({ location: path.join(evidence, t.name.replace(/[^a-z0-9]/gi, '-') + '.sqlite') }),
    { policy: fixtures.POLICY, actor: { deviceId: 'synthetic-mac', incarnationId: 'synthetic-install' } });
  await store.commitLocal(fixtures.local());
  const requests = [];
  const service = host.createRecordSyncHost({ window, owner, origin: frame.origin, configuration,
    canConnect: () => true, storeTimeoutMs,
    launch: async (args) => {
      started += 1;
      if (launch) return launch(args);
      const abort = new AbortController();
      lease = { binding: fixtures.POLICY.binding, revocationSignal: abort.signal,
        revoke: () => abort.abort() };
      return lease;
    } });
  frame.send = (_channel, envelope) => {
    requests.push(envelope);
    void (async () => {
      let response;
      try {
        if (storeReply) response = await storeReply(envelope, store);
        if (response === 'drop') return;
        if (!response) {
          const value = envelope.method === 'snapshot' ? { ...await store.snapshot(), documents: [] }
            : await store[envelope.method](envelope.request);
          response = { ok: true, value };
        }
      } catch (error) { response = { ok: false, error: { code: error.code || 'reopen-required' } }; }
      service.receiveStoreReply({ registrationId: envelope.registrationId, requestId: envelope.requestId, response });
    })();
  };
  const registration = await service.register({ binding: fixtures.POLICY.binding });
  t.after(async () => { service.close(); await store.close(); });
  return { service, registration, store, requests, contents, frame, session,
    started: () => started, pulled: () => pulled, lease: () => lease };
}

test('registration stays local and unconfigured sync never starts a native helper', async (t) => {
  const f = await scenario(t, { configuration: null });
  assert.equal(f.started(), 0);
  assert.deepEqual(await f.service.connect(f.registration), { state: 'unavailable', code: 'setup-required' });
  assert.equal(f.started(), 0);
  assert.equal(f.requests.length, 0);
});

test('one explicit cycle durably acknowledges a local note and receives a phone note through the actual coordinator', async (t) => {
  const f = await scenario(t);
  assert.equal((await f.service.connect(f.registration)).state, 'ready');
  const result = await f.service.sync(f.registration);
  assert.equal(result.state, 'ready');
  assert.equal(result.result.acknowledged.length, 1);
  assert.equal(result.result.received.length, 1);
  const snapshot = await f.store.snapshot();
  assert.equal(snapshot.outbox.length, 0);
  assert.equal(snapshot.replica.operations.length, 2);
  assert.equal(snapshot.checkpoints[0].value, 'synthetic-cursor');
  assert.equal(snapshot.documents[0].value.fullBody, 'LOCAL_ONLY_FULL_BODY');
  assert(f.requests.some((request) => request.method === 'commitReceive'));
});

test('a retryable storage revision race is reconstructed across the IPC error envelope', async (t) => {
  let rejected = false;
  const f = await scenario(t, { storeReply: (request) => {
    if (request.method === 'acknowledgeOutbox' && !rejected) {
      rejected = true;
      return { ok: false, error: { code: 'stale-revision' } };
    }
  } });
  await f.service.connect(f.registration);
  assert.equal((await f.service.sync(f.registration)).state, 'ready');
  assert.equal(f.requests.filter((request) => request.method === 'acknowledgeOutbox').length, 2);
});

test('an uncertain durable acknowledgement is never retried or treated as success', async (t) => {
  const f = await scenario(t, { storeReply: (request) => request.method === 'acknowledgeOutbox'
    ? { ok: false, error: { code: 'stale-revision', targetCommitDurable: true } } : undefined });
  await f.service.connect(f.registration);
  assert.deepEqual(await f.service.sync(f.registration), { state: 'error', code: 'reopen-required' });
  assert.equal(f.requests.filter((request) => request.method === 'acknowledgeOutbox').length, 1);
  assert.equal(f.pulled(), 0);
  assert.deepEqual(await f.service.connect(f.registration), { state: 'error', code: 'reopen-required' });
});

test('a foreign renderer snapshot cannot be transmitted under the paired native scope', async (t) => {
  const f = await scenario(t, { storeReply: async (request, store) => request.method === 'snapshot'
    ? { ok: true, value: { ...await store.snapshot(), documents: [], policy: { ...fixtures.POLICY,
      binding: { ...fixtures.POLICY.binding, learnerId: 'other-learner' } } } } : undefined });
  await f.service.connect(f.registration);
  assert.deepEqual(await f.service.sync(f.registration), { state: 'error', code: 'binding-mismatch' });
  assert.equal(f.pulled(), 0);
  assert.equal((await f.store.snapshot()).outbox.length, 1);
});

test('private learner documents are refused if accidentally included in a transport snapshot', async (t) => {
  const f = await scenario(t, { storeReply: async (request, store) => request.method === 'snapshot'
    ? { ok: true, value: await store.snapshot() } : undefined });
  await f.service.connect(f.registration);
  assert.deepEqual(await f.service.sync(f.registration), { state: 'error', code: 'binding-mismatch' });
  assert.equal(f.pulled(), 0);
});

test('navigation while native confirmation is pending refuses the late lease', async (t) => {
  let resolve;
  let revoked = 0;
  const abort = new AbortController();
  const f = await scenario(t, { launch: () => new Promise((done) => { resolve = done; }) });
  const connecting = f.service.connect(f.registration);
  f.contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
  resolve({ binding: fixtures.POLICY.binding, revocationSignal: abort.signal, revoke: () => { revoked += 1; abort.abort(); } });
  assert.deepEqual(await connecting, { state: 'error', code: 'stale-session' });
  assert.equal(revoked, 1);
  assert.equal(f.requests.length, 0);
});

test('a delayed cancelled connect cannot abort a replacement on the same registration', async (t) => {
  const pending = [];
  const f = await scenario(t, { launch: ({ signal }) => new Promise((resolve, reject) => {
    pending.push({ signal, resolve, reject });
  }) });
  const first = f.service.connect(f.registration);
  f.service.disconnect(f.registration);
  const replacement = f.service.connect(f.registration);
  assert.equal(pending.length, 2);
  pending[0].reject(Object.assign(new Error('Delayed cancelled native confirmation'), { code: 'cancelled' }));
  assert.deepEqual(await first, { state: 'error', code: 'stale-session' });
  assert.equal(pending[1].signal.aborted, false);
  const abort = new AbortController();
  pending[1].resolve({ binding: fixtures.POLICY.binding, revocationSignal: abort.signal, revoke: () => abort.abort() });
  assert.deepEqual(await replacement, { state: 'ready' });
  assert.deepEqual(f.service.status(f.registration), { state: 'ready' });
});

test('a cancelled old sync cannot publish its error into a replacement connection', async (t) => {
  const f = await scenario(t, { storeReply: () => 'drop' });
  await f.service.connect(f.registration);
  const first = f.service.sync(f.registration);
  assert.equal(f.requests.length, 1);
  f.service.disconnect(f.registration);
  const replacement = f.service.connect(f.registration);
  assert.deepEqual(await replacement, { state: 'ready' });
  assert.equal((await first).state, 'error');
  assert.deepEqual(f.service.status(f.registration), { state: 'ready' });
  assert.equal(f.pulled(), 0);
});

for (const method of ['acknowledgeOutbox', 'commitReceive']) {
  test(`disconnect during pending ${method} requires a fresh document even after a late durable reply`, async (t) => {
    let reached;
    let release;
    let held = false;
    const submitted = new Promise((resolve) => { reached = resolve; });
    const delayed = new Promise((resolve) => { release = resolve; });
    const f = await scenario(t, { storeReply: async (request, store) => {
      if (request.method !== method || held) return;
      held = true;
      // The real SQLite mutation has settled, but the main process cannot
      // know its outcome while the renderer's completion is withheld.
      await store[method](request.request);
      reached(request);
      await delayed;
      return { ok: false, error: { code: 'stale-revision', targetCommitDurable: true } };
    } });
    await f.service.connect(f.registration);
    const syncing = f.service.sync(f.registration);
    const request = await submitted;
    const durable = await f.store.snapshot();
    assert.equal(durable.outbox.length, 0);
    assert.equal(durable.replica.operations.length, method === 'commitReceive' ? 2 : 1);
    assert.equal(durable.checkpoints.length, method === 'commitReceive' ? 1 : 0);

    const uncertain = { state: 'error', code: 'reopen-required' };
    assert.deepEqual(f.service.disconnect(f.registration), uncertain);
    assert.equal((await syncing).state, 'error');
    assert.deepEqual(await f.service.connect(f.registration), uncertain);
    assert.deepEqual(await f.service.sync(f.registration), uncertain);
    assert.equal(f.started(), 1);

    // A registration UUID change in the same real frame/document is not a
    // storage reopen, and cannot remove uncertainty or consume a late reply.
    const replacement = await f.service.register({ binding: fixtures.POLICY.binding });
    assert.notEqual(replacement.registrationId, f.registration.registrationId);
    assert.deepEqual(f.service.status(replacement), uncertain);
    assert.deepEqual(await f.service.connect(replacement), uncertain);
    release();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(f.service.status(replacement), uncertain);
    assert.equal(f.requests.filter((entry) => entry.method === method).length, 1);
    assert.equal(f.started(), 1);
    assert.deepEqual(await f.store.snapshot(), durable);

    f.contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
    f.frame.frameToken = 'synthetic-frame-b';
    const reopened = await f.service.register({ binding: fixtures.POLICY.binding });
    assert.deepEqual(f.service.status(reopened), { state: 'disconnected' });
    // Replaying the old completion cannot contaminate the fresh registration.
    f.service.receiveStoreReply({ registrationId: request.registrationId, requestId: request.requestId,
      response: { ok: false, error: { code: 'reopen-required', targetCommitDurable: true } } });
    assert.deepEqual(await f.service.connect(reopened), { state: 'ready' });
    assert.equal(f.started(), 2);
    assert.equal((await f.service.sync(reopened)).state, 'ready');
    assert.equal((await f.store.snapshot()).outbox.length, 0);
  });
}

test('native revocation cancels a waiting store request and prevents subsequent pull', async (t) => {
  const f = await scenario(t, { storeReply: () => 'drop' });
  await f.service.connect(f.registration);
  const syncing = f.service.sync(f.registration);
  assert.equal(f.requests.length, 1);
  f.lease().revoke();
  assert.equal((await syncing).state, 'error');
  assert.equal(f.service.status(f.registration).state, 'disconnected');
  assert.equal(f.pulled(), 0);
});

test('native pairing export contains only the confirmed learner candidate and expires on revocation', async (t) => {
  const f = await scenario(t);
  assert.throws(() => f.service.capturePairingCandidate(), /session-required/);
  await f.service.connect(f.registration);
  const capture = f.service.capturePairingCandidate();
  assert.deepEqual(JSON.parse(capture.bytes), { accountId: fixtures.POLICY.binding.accountId,
    format: 'kairo-native-profile-candidate', label: 'Synthetic learner',
    learnerId: fixtures.POLICY.binding.learnerId, version: 1 });
  assert(capture.assertCurrent());
  f.lease().revoke();
  assert.equal(capture.assertCurrent(), false);
  assert.throws(() => f.service.capturePairingCandidate(), /session-required/);
});

test('stale registrations and wrong renderer frames cannot reach fixed IPC operations', async () => {
  const handles = new Map();
  const listeners = new Map();
  let calls = 0;
  const ipcMain = { handle: (name, fn) => handles.set(name, fn), on: (name, fn) => listeners.set(name, fn) };
  host.installRecordSyncIPC({ ipcMain, fromApp: (event) => event.trusted,
    active: () => ({ connect: () => { calls += 1; }, receiveStoreReply: () => { calls += 1; } }) });
  assert.throws(() => handles.get('bunki:sync:connect')({ trusted: false }, { registrationId: 'x' }), /frame-forbidden/);
  listeners.get('bunki:sync:store-reply')({ trusted: false }, {});
  assert.equal(calls, 0);
  assert(!handles.has('bunki:sync:push'));
});
