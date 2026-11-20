/* global process, URL, EventTarget, Response, Event */
import assert from 'node:assert/strict';
const { test } = await import(
  process.env.VITEST === 'true' && !process.env.NODE_TEST_CONTEXT ? 'vitest' : 'node:test'
);
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { createBunkiStudyAdapter } from '../prototypes/corridor/study-engine-adapter.mjs';
import { createSharedStudySync } from '../prototypes/corridor/shared-study-sync.mjs';
import { createMemoryAdapter } from '../prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';
const root = new URL('../prototypes/corridor/', import.meta.url),
  fixture = JSON.parse(readFileSync(new URL('tools/fixtures/shared-srs-contracts.json', root)));
const catalog = fixture.cards,
  pin = JSON.parse(
    readFileSync(new URL('vendor/shared-study-engine/client/vendor/fsrs-pin.json', root)),
  );
const content = {
  pin,
  catalog,
  registry: {
    tasks: catalog.map(({ taskKey, noteGuid, contractId, passageId, lexemeId }) => ({
      taskKey,
      noteGuid,
      contractId,
      passageId,
      lexemeId,
    })),
    notes: catalog.map(({ noteGuid, module }) => ({ noteGuid, module })),
    passages: [],
    examples: [],
  },
};
async function setup(config = {}) {
  let online = true,
    visible = true,
    sequence = 0,
    failBeforeAccept = 0,
    invalidAck = false,
    auth = false;
  const scope = {
      learner: 'test-shared-audio',
      environment: 'test-shared-audio',
      installation: 'test-lifecycle-bunki',
    },
    target = new EventTarget(),
    rows = [],
    requests = [],
    bodies = [];
  const request = async (url, init) => {
    requests.push(url);
    let reply,
      status = 200;
    if (auth) {
      status = 401;
      reply = { scope };
    } else if (init.method === 'POST') {
      bodies.push(init.body);
      if (failBeforeAccept-- > 0) throw Error('synthetic-network-error');
      const body = JSON.parse(init.body);
      for (const row of body.events)
        if (!rows.some((r) => r.event.id === row.event.id))
          rows.push({ ...row, seq: rows.length + 1, rt: Date.now(), authority: 'device' });
      reply = {
        scope,
        head: rows.length,
        acks: body.events.map(({ event, bodyHash }) => ({
          id: event.id,
          bodyHash,
          ...(!invalidAck ? { seq: rows.find((r) => r.event.id === event.id).seq } : {}),
        })),
      };
    } else
      reply = {
        scope,
        head: rows.length,
        events: rows.filter((r) => r.seq > Number(new URL(url).searchParams.get('after'))),
      };
    const response = new Response(JSON.stringify(reply), { status });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  };
  const sync = createSharedStudySync({
    origin: 'https://synthetic.invalid',
    getCredential: () => 'synthetic-only',
    fetch: request,
    eventTarget: target,
    online: () => online,
    visible: () => visible,
    automatic: false,
    permits: { isPaired: () => true, reserve: async () => {} },
    transportOptions: { maxRetries: 0 },
    ...config,
  });
  const adapter = await createBunkiStudyAdapter({
    content,
    storage: createMemoryAdapter(),
    identity: { ...scope, mode: 'fresh' },
    transport: sync,
    ...sync.hooks,
    uuid: () => `test-command-${++sequence}`,
  });
  await sync.attach(adapter);
  return {
    adapter,
    sync,
    target,
    requests,
    bodies,
    setOnline: (v) => (online = v),
    setVisible: (v) => (visible = v),
    failPosts: (n) => (failBeforeAccept = n),
    invalidAck: (v) => (invalidAck = v),
    auth: (v) => (auth = v),
    async local() {
      const command = adapter.backend.command('settings', { key: 'newPerDayTotal', value: 15 });
      assert.equal((await adapter.backend.submitCommand(command)).kind, 'durable');
    },
    dispose() {
      sync.dispose();
      adapter.backend.dispose();
    },
  };
}
test('exact singleflight survives reentrant observers, holds, hidden host and disposal', async () => {
  const d = await setup();
  try {
    let nested,
      notices = 0;
    const unsubscribe = d.sync.hooks.subscribeSyncState(() => {
      notices++;
      if (d.sync.hooks.getSyncState() === 'syncing') nested = d.sync.synchronize();
    });
    const first = d.sync.synchronize();
    assert.equal(first, d.sync.synchronize());
    await first;
    assert.equal(first, nested);
    assert.ok(notices > 0);
    d.sync.hold('update');
    const count = d.requests.length;
    assert.equal((await d.sync.synchronize()).state, 'paused');
    d.sync.release('wrong');
    assert.equal((await d.sync.synchronize()).state, 'paused');
    assert.equal(d.requests.length, count);
    d.sync.release('update');
    d.setVisible(false);
    await d.sync.synchronize();
    assert.equal(d.requests.length, count);
    d.setVisible(true);
    await d.sync.synchronize();
    unsubscribe();
    d.sync.dispose();
    const stopped = d.requests.length;
    await d.sync.synchronize();
    d.target.dispatchEvent(new Event('online'));
    await delay(40);
    assert.equal(d.requests.length, stopped);
  } finally {
    d.dispose();
  }
});
test('failed network retry uploads identical bytes; malformed acknowledgement never promotes confirmation', async () => {
  const d = await setup({ transportOptions: { maxRetries: 1, wait: async () => {} } });
  try {
    await d.local();
    d.failPosts(1);
    assert.equal((await d.sync.synchronize()).state, 'up-to-date');
    assert.equal(d.bodies.length, 2);
    assert.equal(d.bodies[0], d.bodies[1]);
  } finally {
    d.dispose();
  }
  const broken = await setup();
  try {
    await broken.local();
    const old = await broken.adapter.store.outbox();
    broken.invalidAck(true);
    assert.equal((await broken.sync.synchronize()).error, 'store-failed');
    assert.deepEqual(await broken.adapter.store.outbox(), old);
    assert.equal((await broken.adapter.store.status()).pending, 1);
    assert.notEqual(broken.sync.hooks.getSyncState(), 'up-to-date');
  } finally {
    broken.dispose();
  }
});
test('authentication pause requires explicit resume; reconnect drains local work without reconcile wake loops', async () => {
  const d = await setup({ automatic: true });
  try {
    d.auth(true);
    assert.equal((await d.sync.synchronize()).state, 'paused-auth');
    const count = d.requests.length;
    d.auth(false);
    await d.sync.synchronize();
    assert.equal(d.requests.length, count);
    d.sync.resumeAfterPairing();
    assert.equal((await d.sync.synchronize()).state, 'up-to-date');
    d.setOnline(false);
    await d.local();
    assert.equal((await d.sync.synchronize()).state, 'offline');
    d.setOnline(true);
    d.target.dispatchEvent(new Event('online'));
    for (let pass = 0; pass < 30 && (await d.adapter.store.status()).pending; pass++)
      await delay(10);
    assert.equal((await d.adapter.store.status()).pending, 0);
    assert.equal(d.sync.hooks.getSyncState(), 'up-to-date');
    const settled = d.requests.length;
    await delay(60);
    assert.equal(d.requests.length, settled);
  } finally {
    d.dispose();
  }
});
