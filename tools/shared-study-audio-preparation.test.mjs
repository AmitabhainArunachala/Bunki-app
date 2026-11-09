/* global process, URL, EventTarget, structuredClone, Event */
import assert from 'node:assert/strict';
const { test } = await import(
  process.env.VITEST === 'true' && !process.env.NODE_TEST_CONTEXT ? 'vitest' : 'node:test'
);
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = process.env.BUNKI_AUDIO_ROOT ?? fileURLToPath(new URL('../', import.meta.url));
const { attachSharedStudyAudioPreparation, disposeSharedStudyAudioPreparation } = await import(
  new URL('prototypes/corridor/shared-study-audio-preparation.mjs', 'file://' + root + '/')
);
const hash = (c) => c.repeat(64);
const binding = {
  source: { catalogSha256: hash('a'), registrySha256: hash('b') },
  grammarAssets: { 'grammar.json': hash('c') },
  dictionary: { buildSha256: hash('d') },
};
const build = {
  format: 'nihongo-mnow-content',
  version: 1,
  release3FullCorpus: true,
  files: { 'catalog.json': hash('a'), 'registry.json': hash('b'), 'grammar.json': hash('c') },
};
function fixture(extra = {}) {
  let started = 0,
    stopped = 0,
    writes = 0,
    args = null;
  const listeners = new Set(),
    events = new EventTarget();
  const store = {
    scope: { learner: 'test-bunki', environment: 'test-bunki', installation: 'test-install' },
    readState() {
      return { epoch: 0 };
    },
    subscribe(f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    compareAndSwap() {
      writes++;
      throw Error('grade ledger write forbidden');
    },
  };
  const catalog = [{ taskKey: 'task' }];
  const adapter = Object.freeze({
    store,
    catalog,
    backend: {},
    platform: Object.freeze({ storageKind: 'bunki-shared' }),
  });
  const canonical = {
    acceptedAudioSourceRevision({ build: b }) {
      assert.equal(Object.getPrototypeOf(b), Object.prototype);
      return b.files['catalog.json'] + ':' + b.files['grammar.json'];
    },
    startAcceptedAudioHost(o) {
      started++;
      args = o;
      const unsub = o.store.subscribe(() => {});
      return {
        status: () => ({ state: 'pending', coverage: { demands: 1 } }),
        flush: async () => {},
        dispose() {
          stopped++;
          unsub();
        },
      };
    },
  };
  const attached = attachSharedStudyAudioPreparation({
    adapter,
    binding,
    eventTarget: events,
    loadCanonical: async () => canonical,
    ...extra,
  });
  return {
    adapter,
    attached,
    store,
    catalog,
    events,
    listeners,
    canonical,
    get args() {
      return args;
    },
    get started() {
      return started;
    },
    get stopped() {
      return stopped;
    },
    get writes() {
      return writes;
    },
  };
}
test('parent realm clone, exact accepted pins and original store/catalog; pending never recorded', async () => {
  const f = fixture();
  const foreign = vm.runInNewContext(
    '({build:' +
      JSON.stringify(build) +
      ',grammarRecords:[{guid:"grammar",examples:[{ja:"全文"}]}]})',
  );
  await f.attached.ensureAudioPreparation(foreign);
  assert.equal(f.started, 1);
  assert.equal(f.args.store, f.store);
  assert.equal(f.args.catalog, f.catalog);
  assert.notEqual(f.args.grammarRecords, foreign.grammarRecords);
  assert.equal(Object.getPrototypeOf(f.args.grammarRecords), Array.prototype);
  assert.equal(Object.getPrototypeOf(f.args.grammarRecords[0]), Object.prototype);
  foreign.grammarRecords[0].examples[0].ja = 'changed';
  assert.equal(f.args.grammarRecords[0].examples[0].ja, '全文');
  assert.equal(f.args.native, false);
  assert.deepEqual(f.attached.platform.getAudioPreparationState(), {
    state: 'pending',
    coverage: { demands: 1 },
  });
  assert.equal(f.writes, 0);
  disposeSharedStudyAudioPreparation(f.attached);
});
test('each catalog registry grammar pin mismatch rejects before canonical observer starts; valid retry succeeds', async () => {
  for (const name of ['catalog.json', 'registry.json', 'grammar.json']) {
    const f = fixture();
    const wrong = structuredClone(build);
    wrong.files[name] = hash('e');
    await assert.rejects(
      () => f.attached.ensureAudioPreparation({ build: wrong, grammarRecords: [] }),
      /source|binding|pin/,
    );
    assert.equal(f.started, 0);
    assert.equal(f.attached.platform.getAudioPreparationState().state, 'error');
    await f.attached.ensureAudioPreparation({ build, grammarRecords: [] });
    assert.equal(f.started, 1);
    disposeSharedStudyAudioPreparation(f.attached);
  }
});
test('same store across repeated adapter/frame calls has one lifecycle; pagehide unsubscribes exactly once', async () => {
  const f = fixture();
  const again = attachSharedStudyAudioPreparation({
    adapter: f.adapter,
    binding,
    eventTarget: f.events,
    loadCanonical: async () => f.canonical,
  });
  await Promise.all([
    f.attached.ensureAudioPreparation({ build, grammarRecords: [] }),
    again.ensureAudioPreparation({ build, grammarRecords: [] }),
  ]);
  assert.equal(f.started, 1);
  assert.equal(f.listeners.size, 1);
  f.events.dispatchEvent(new Event('pagehide'));
  assert.equal(f.stopped, 1);
  assert.equal(f.listeners.size, 0);
  disposeSharedStudyAudioPreparation(f.adapter);
  assert.equal(f.stopped, 1);
  await assert.rejects(
    () => f.attached.ensureAudioPreparation({ build, grammarRecords: [] }),
    /disposed/,
  );
  assert.equal(f.writes, 0);
});
test('failed import retries, dispose during pending import prevents late subscription; no flush awaited by ensure', async () => {
  let tries = 0;
  const f = fixture({
    loadCanonical: async () => {
      if (++tries === 1) throw Error('synthetic-load-failure');
      return f.canonical;
    },
  });
  await assert.rejects(() => f.attached.ensureAudioPreparation({ build, grammarRecords: [] }));
  await f.attached.ensureAudioPreparation({ build, grammarRecords: [] });
  assert.equal(f.started, 1);
  disposeSharedStudyAudioPreparation(f.adapter);
  let release;
  const held = new Promise((r) => (release = r));
  const g = fixture({ loadCanonical: () => held });
  const opening = g.attached.ensureAudioPreparation({ build, grammarRecords: [] });
  disposeSharedStudyAudioPreparation(g.adapter);
  release(g.canonical);
  await assert.rejects(() => opening, /disposed/);
  assert.equal(g.started, 0);
  assert.equal(g.listeners.size, 0);
  assert.equal(g.writes, 0);
});

test('ensure never invokes or awaits the full observer flush', async () => {
  let flushes = 0;
  const f = fixture({
    loadCanonical: async () => ({
      acceptedAudioSourceRevision: () => 'source',
      startAcceptedAudioHost: () => ({
        status: () => ({ state: 'pending' }),
        dispose() {},
        flush() {
          flushes++;
          return new Promise(() => {});
        },
      }),
    }),
  });
  await f.attached.ensureAudioPreparation({ build, grammarRecords: [] });
  assert.equal(flushes, 0);
  disposeSharedStudyAudioPreparation(f.adapter);
});
test('actual QA host disposal retires parent preparation before backend and storage', async () => {
  const { createSharedStudyTestHost, QA_HOST_MARKER } = await import(
    new URL('prototypes/corridor/shared-study-test-host.mjs', 'file://' + root + '/')
  );
  const metadata = new Map(),
    order = [];
  const store = {
    scope: {
      learner: 'test-shared-audio',
      environment: 'test-shared-audio',
      installation: 'test-shared-audio-bunki-lifecycle',
    },
    readState: () => ({ epoch: 0 }),
    subscribe: () => () => {},
  };
  const host = await createSharedStudyTestHost({
    marker: QA_HOST_MARKER,
    runId: 'audio-lifecycle',
    metadata: { getItem: (k) => metadata.get(k) ?? null, setItem: (k, v) => metadata.set(k, v) },
    locks: { request: async (_name, f) => f() },
    uuid: () => 'lifecycle',
    storageFactory: () => ({
      read() {
        throw Error('unexpected grade read');
      },
      compareAndSwap() {
        throw Error('unexpected grade write');
      },
      close() {
        order.push('storage');
      },
    }),
  });
  const adapter = await host.withAdapter(() =>
    Object.freeze({
      store,
      catalog: [],
      backend: {
        dispose() {
          order.push('backend');
        },
      },
      platform: {},
    }),
  );
  const attached = attachSharedStudyAudioPreparation({
    adapter,
    binding,
    eventTarget: new EventTarget(),
    loadCanonical: async () => ({
      acceptedAudioSourceRevision: () => 'source',
      startAcceptedAudioHost: () => ({
        status: () => ({ state: 'pending' }),
        flush: async () => {},
        dispose() {
          order.push('audio');
        },
      }),
    }),
  });
  await attached.ensureAudioPreparation({ build, grammarRecords: [] });
  await host.dispose();
  assert.deepEqual(order, ['audio', 'backend', 'storage']);
  disposeSharedStudyAudioPreparation(adapter);
  assert.deepEqual(order, ['audio', 'backend', 'storage']);
});

test('pagehide fences an unresolved helper import and request data is cloned before awaiting', async () => {
  let release;
  const held = new Promise((r) => (release = r));
  const f = fixture({ loadCanonical: () => held });
  const opening = f.attached.ensureAudioPreparation({ build, grammarRecords: [] });
  f.events.dispatchEvent(new Event('pagehide'));
  release(f.canonical);
  await assert.rejects(() => opening, /disposed/);
  assert.equal(f.started, 0);
  assert.equal(f.listeners.size, 0);
  let resolve;
  const pending = new Promise((r) => (resolve = r));
  const g = fixture({ loadCanonical: () => pending });
  const input = vm.runInNewContext(
    '({build:' + JSON.stringify(build) + ',grammarRecords:[{guid:"original"}]})',
  );
  const starting = g.attached.ensureAudioPreparation(input);
  input.build.files['catalog.json'] = hash('f');
  input.grammarRecords[0].guid = 'changed';
  resolve(g.canonical);
  await starting;
  assert.equal(g.args.grammarRecords[0].guid, 'original');
  assert.equal(g.args.sourceRevision, hash('a') + ':' + hash('c'));
  disposeSharedStudyAudioPreparation(g.adapter);
});

test('one parent pagehide listener is removed by explicit disposal before navigation', async () => {
  class TrackedEvents extends EventTarget {
    listeners = new Set();
    addEventListener(type, fn, options) {
      if (type === 'pagehide') this.listeners.add(fn);
      return super.addEventListener(type, fn, options);
    }
    removeEventListener(type, fn, options) {
      if (type === 'pagehide') this.listeners.delete(fn);
      return super.removeEventListener(type, fn, options);
    }
  }
  const events = new TrackedEvents(),
    f = fixture({ eventTarget: events });
  assert.equal(events.listeners.size, 1);
  await f.attached.ensureAudioPreparation({ build, grammarRecords: [] });
  assert.equal(events.listeners.size, 1);
  disposeSharedStudyAudioPreparation(f.adapter);
  assert.equal(events.listeners.size, 0);
  assert.equal(f.stopped, 1);
});

function transition(type, persisted) {
  const e = new Event(type);
  Object.defineProperty(e, 'persisted', { value: persisted });
  return e;
}
test('persisted pagehide/pageshow keeps one live observer and final pagehide disposes', async () => {
  const f = fixture();
  await f.attached.ensureAudioPreparation({ build, grammarRecords: [] });
  for (let i = 0; i < 2; i++) {
    f.events.dispatchEvent(transition('pagehide', true));
    f.events.dispatchEvent(transition('pageshow', true));
    await f.attached.ensureAudioPreparation({ build, grammarRecords: [] });
    assert.equal(f.started, 1);
    assert.equal(f.stopped, 0);
    assert.equal(f.listeners.size, 1);
  }
  f.events.dispatchEvent(transition('pagehide', false));
  assert.equal(f.stopped, 1);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.attached.platform.getAudioPreparationState().state, 'disposed');
  f.events.dispatchEvent(transition('pageshow', false));
  await assert.rejects(
    () => f.attached.ensureAudioPreparation({ build, grammarRecords: [] }),
    /disposed/,
  );
  assert.equal(f.started, 1);
});
test('persisted navigation during lazy import does not retire or duplicate continuation', async () => {
  let release;
  const pending = new Promise((r) => (release = r));
  const f = fixture({ loadCanonical: () => pending });
  const opening = f.attached.ensureAudioPreparation({ build, grammarRecords: [] });
  f.events.dispatchEvent(transition('pagehide', true));
  f.events.dispatchEvent(transition('pageshow', true));
  release(f.canonical);
  await opening;
  await f.attached.ensureAudioPreparation({ build, grammarRecords: [] });
  assert.equal(f.started, 1);
  assert.equal(f.stopped, 0);
  assert.equal(f.listeners.size, 1);
  f.events.dispatchEvent(transition('pagehide', false));
  assert.equal(f.stopped, 1);
  assert.equal(f.listeners.size, 0);
});
