/* global process, URL, Response, EventTarget */
/** Direct canonical browser-style installation against the Bunki shell port.
 * Synthetic authority and memory CAS only; physical Mac evidence is separate. */
import assert from 'node:assert/strict';
const { test } = await import(
  process.env.VITEST === 'true' && !process.env.NODE_TEST_CONTEXT ? 'vitest' : 'node:test'
);
import { readFileSync } from 'node:fs';
import { createBunkiStudyAdapter } from '../prototypes/corridor/study-engine-adapter.mjs';
import { createSharedStudySync } from '../prototypes/corridor/shared-study-sync.mjs';
import {
  createStudyEngine,
  createMemoryAdapter,
  dayBounds,
  payloadHash,
  canonicalStringify,
} from '../prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';
const root = new URL('../prototypes/corridor/', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('tools/fixtures/shared-srs-contracts.json', root)));
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

test('direct canonical installation and ordinary Bunki port share exact commands, schedules, conflict and undo', async () => {
  let clock = Date.parse('2026-11-08T10:00:00Z'),
    loseUpload = false,
    unavailable = false;
  const now = () => clock,
    rows = [],
    uploadBodies = [],
    permitIntents = [];
  function grant(installation, count) {
    const seq = rows.length + 1,
      event = {
        v: 4,
        id: `@server:${seq}`,
        learner: 'test-shared-audio',
        install: '@server',
        dseq: seq,
        base: seq - 1,
        ts: now(),
        epoch: 0,
        policy: 'nsrs-policy-v1',
        type: 'permit-grant',
        data: {
          install: installation,
          permitIds: Array.from({ length: count }, (_, i) => `canonical-host-${seq}-${i}`),
          ...dayBounds(now(), 'Asia/Tokyo'),
        },
      };
    rows.push({ seq, rt: now(), authority: 'server', event, bodyHash: payloadHash(event) });
  }
  const devices = [];
  async function installation(kind, storage = createMemoryAdapter(), mode = 'fresh') {
    const scope = {
      learner: 'test-shared-audio',
      environment: 'test-shared-audio',
      installation: `test-shared-audio-${kind}`,
    };
    const request = async (url, init) => {
      if (unavailable) throw Error('synthetic-offline');
      let result;
      if (init.method === 'POST') {
        const body = JSON.parse(init.body);
        uploadBodies.push(init.body);
        for (const row of body.events) {
          const existing = rows.find((r) => r.event.id === row.event.id);
          if (existing) assert.equal(existing.bodyHash, row.bodyHash);
          else rows.push({ ...row, seq: rows.length + 1, rt: now(), authority: 'device' });
        }
        if (loseUpload) {
          loseUpload = false;
          throw Error('synthetic-lost-ack');
        }
        result = {
          scope,
          head: rows.length,
          acks: body.events.map(({ event, bodyHash }) => ({
            id: event.id,
            bodyHash,
            seq: rows.find((row) => row.event.id === event.id).seq,
          })),
        };
      } else
        result = {
          scope,
          head: rows.length,
          events: rows.filter((r) => r.seq > Number(new URL(url).searchParams.get('after'))),
        };
      const response = new Response(JSON.stringify(result));
      Object.defineProperty(response, 'url', { value: url });
      return response;
    };
    const session = createSharedStudySync({
      origin: 'https://synthetic.invalid',
      getCredential: () => 'qa-synthetic-only',
      fetch: request,
      now,
      online: () => !unavailable,
      visible: () => true,
      automatic: false,
      eventTarget: new EventTarget(),
      transportOptions: { maxRetries: 0 },
      permits: {
        isPaired: () => true,
        reserve: async (count, requestId, policy) => {
          permitIntents.push({ scope, count, requestId, policy });
          grant(scope.installation, count);
        },
      },
    });
    let adapter;
    if (kind === 'canonical-browser') {
      const engine = createStudyEngine({ content, learner: scope.learner, timezone: 'Asia/Tokyo' });
      const store =
        mode === 'fresh'
          ? await engine.createFreshStore({
              adapter: storage,
              environment: scope.environment,
              newInstallationId: () => scope.installation,
              now,
            })
          : await engine.openStore({ adapter: storage, scope, now });
      await engine.refreshCorpus(store, { readPreviousRegistry: null, allowQAExpansion: false });
      const backend = await engine.connect({ store, transport: session, now });
      adapter = { engine, store, backend };
    } else
      adapter = await createBunkiStudyAdapter({
        content,
        storage,
        identity: { ...scope, mode },
        transport: session,
        ...session.hooks,
        now,
      });
    await session.attach(adapter);
    const device = { ...adapter, session, storage, scope };
    devices.push(device);
    return device;
  }
  const projection = (d) => d.backend.readProjection();
  async function settle(a, b) {
    await a.session.synchronize();
    await b.session.synchronize();
    await a.session.synchronize();
    await a.backend.refresh();
    await b.backend.refresh();
    assert.equal(canonicalStringify(projection(a)), canonicalStringify(projection(b)));
    assert.equal((await a.store.status()).pending, 0);
    assert.equal((await b.store.status()).pending, 0);
  }
  async function grade(d, key, rating) {
    const attempt = d.backend.snapshotAttempt(key),
      preview = d.backend.preview(attempt, 1800),
      command = preview.intents[rating];
    const result = await d.backend.submitCommand(command);
    assert.equal(result.kind, 'durable');
    return { command, result, preview };
  }
  try {
    const canonical = await installation('canonical-browser'),
      bunki = await installation('bunki');
    assert.notEqual(canonical.scope.installation, bunki.scope.installation);
    await canonical.session.reserveNewPermits({ store: canonical.store });
    await bunki.session.reserveNewPermits({ store: bunki.store });
    await settle(canonical, bunki);
    assert.ok(permitIntents.length >= 2);
    const [a, b] = catalog;
    const fromBunki = await grade(bunki, a.taskKey, 2);
    const durable = (await bunki.store.outbox()).find(
      (row) => row.event.id === fromBunki.result.eventId,
    );
    loseUpload = true;
    assert.equal((await bunki.session.synchronize()).error, 'network-failed');
    assert.equal(canonicalStringify((await bunki.store.outbox())[0]), canonicalStringify(durable));
    await settle(canonical, bunki);
    const adopted = rows.find((row) => row.event.id === fromBunki.result.eventId);
    assert.equal(canonicalStringify(adopted.event), canonicalStringify(durable.event));
    assert.equal(adopted.bodyHash, durable.bodyHash);
    const review = projection(canonical).reviews.find((r) => r.id === fromBunki.result.eventId);
    assert.equal(review.taskKey, a.taskKey);
    assert.equal(review.rawRating, 2);
    assert.equal(review.effectiveRating, fromBunki.preview.ratings[2].effectiveRating);
    assert.equal(
      canonicalStringify(projection(canonical).tasks[a.taskKey].card),
      canonicalStringify(fromBunki.preview.cards[2]),
    );
    const fromCanonical = await grade(canonical, b.taskKey, 4);
    await settle(canonical, bunki);
    assert.equal(projection(bunki).tasks[b.taskKey].head, fromCanonical.result.eventId);
    assert.deepEqual(
      projection(bunki).outcomes[fromCanonical.result.eventId],
      projection(canonical).outcomes[fromCanonical.result.eventId],
    );
    // Both devices answer a genuinely due scheduled head before either uploads.
    const due = projection(bunki).tasks[a.taskKey].card.due;
    clock = (typeof due === 'number' ? due : Date.parse(due)) + 1000;
    assert.ok(Number.isFinite(clock));
    unavailable = true;
    const localA = await grade(canonical, a.taskKey, 3),
      localB = await grade(bunki, a.taskKey, 1);
    assert.equal(localA.command.data.parent, localB.command.data.parent);
    assert.equal((await bunki.session.synchronize()).state, 'offline');
    unavailable = false;
    await settle(canonical, bunki);
    const outcomes = projection(bunki).outcomes;
    assert.equal(outcomes[localA.result.eventId].status, 'applied');
    assert.equal(outcomes[localB.result.eventId].status, 'observation');
    assert.equal(outcomes[localB.result.eventId].reason, 'stale-parent');
    assert.equal(projection(bunki).tasks[a.taskKey].head, localA.result.eventId);
    const undo = await canonical.backend.mutate('undo', b.taskKey, {
      target: fromCanonical.result.eventId,
    });
    assert.equal(undo.kind, 'durable');
    await settle(canonical, bunki);
    assert.equal(projection(bunki).tasks[b.taskKey].head, undo.eventId);
    assert.notEqual(
      projection(bunki).reviews.find((r) => r.id === fromCanonical.result.eventId).undoneAt,
      null,
    );
    const snapshot = canonicalStringify(projection(bunki)),
      head = rows.length,
      bodies = uploadBodies.length;
    await settle(canonical, bunki);
    assert.equal(rows.length, head);
    assert.equal(uploadBodies.length, bodies);
    assert.equal(canonicalStringify(projection(bunki)), snapshot);
    for (const d of [canonical, bunki]) {
      d.session.dispose();
      d.backend.dispose();
    }
    const reopenedCanonical = await installation('canonical-browser', canonical.storage, 'open'),
      reopenedBunki = await installation('bunki', bunki.storage, 'open');
    await settle(reopenedCanonical, reopenedBunki);
    assert.equal(canonicalStringify(projection(reopenedBunki)), snapshot);
  } finally {
    for (const d of devices) {
      d.session.dispose();
      d.backend.dispose();
    }
  }
});

test('audio port forwards only byte-resource capability and rejects a semantic player', async () => {
  const audio = {
    protocol: 'nsrs-audio-resources/v1',
    release: {
      releaseId: `sha256:${'a'.repeat(64)}`,
      projectionId: 'test-bunki',
      contentRelease: 'test-v1',
      root: { key: 'root.json', sha256: 'a'.repeat(64), bytes: 32 },
    },
    resources: { read: async () => new Uint8Array(), packState: () => 'missing' },
  };
  const identity = {
    learner: 'test-audio',
    environment: 'test-audio',
    installation: 'test-audio-bunki',
    mode: 'fresh',
  };
  const adapter = await createBunkiStudyAdapter({
    content,
    storage: createMemoryAdapter(),
    identity,
    audio,
  });
  assert.equal(adapter.platform.audio, audio);
  adapter.backend.dispose();
  await assert.rejects(
    () =>
      createBunkiStudyAdapter({
        content,
        storage: createMemoryAdapter(),
        identity,
        audio: { play() {} },
      }),
    /audio/,
  );
});
