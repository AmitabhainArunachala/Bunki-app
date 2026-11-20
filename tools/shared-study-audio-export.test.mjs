/* global process, EventTarget, setImmediate */
import assert from 'node:assert/strict';
const { test } = await import(
  process.env.VITEST === 'true' && !process.env.NODE_TEST_CONTEXT ? 'vitest' : 'node:test'
);
import vm from 'node:vm';
import {
  attachSharedStudyAudioPreparation,
  disposeSharedStudyAudioPreparation,
} from '../prototypes/corridor/shared-study-audio-preparation.mjs';

const hash = (c) => c.repeat(64);
const binding = {
  source: { catalogSha256: hash('a'), registrySha256: hash('b') },
  grammarAssets: { 'grammar.json': hash('c') },
  dictionary: { buildSha256: hash('d') },
};
const build = {
  files: { 'catalog.json': hash('a'), 'registry.json': hash('b'), 'grammar.json': hash('c') },
};
function fixture({ load, exporter } = {}) {
  let starts = 0,
    exports = 0;
  const adapter = { store: {}, catalog: [], backend: {} };
  const canonical = {
    acceptedAudioSourceRevision: () => 'source',
    startAcceptedAudioHost: () => {
      starts++;
      return {
        status: () => ({ state: 'pending' }),
        dispose() {},
        async exportCurrentSource(options) {
          exports++;
          return exporter
            ? exporter(options)
            : { demand: { selectedIds: options.demandIds }, currentSource: { revision: 4 } };
        },
      };
    },
  };
  const attached = attachSharedStudyAudioPreparation({
    adapter,
    binding,
    eventTarget: new EventTarget(),
    loadCanonical: load ?? (async () => canonical),
  });
  return {
    attached,
    adapter,
    canonical,
    get starts() {
      return starts;
    },
    get exports() {
      return exports;
    },
  };
}
test('explicit Bunki export delegates ordered selection without automatic export or mutation', async () => {
  let got;
  const f = fixture({
    exporter: async (options) => {
      got = options;
      return { demand: { selectedIds: options.demandIds }, currentSource: { revision: 7 } };
    },
  });
  assert.equal(typeof f.attached.exportCurrentAudioSource, 'function');
  await assert.rejects(f.attached.exportCurrentAudioSource(), /not.ready|unavailable|not.started/);
  assert.equal(f.starts, 0);
  assert.equal(f.exports, 0);
  await f.attached.ensureAudioPreparation({ build, grammarRecords: [] });
  assert.equal(f.exports, 0);
  const foreign = vm.runInNewContext(
    '({demandIds:["z","a"],expectedDemandRecordRevision:7,limit:2})',
  );
  const promise = f.attached.exportCurrentAudioSource(foreign);
  foreign.demandIds[0] = 'mutated';
  const out = await promise;
  assert.deepEqual(got, { demandIds: ['z', 'a'], expectedDemandRecordRevision: 7, limit: 2 });
  assert.equal(Object.getPrototypeOf(got), Object.prototype);
  assert.equal(Object.getPrototypeOf(got.demandIds), Array.prototype);
  assert.deepEqual(out, { demand: { selectedIds: ['z', 'a'] }, currentSource: { revision: 7 } });
  out.demand.selectedIds[0] = 'caller-change';
  assert.equal(got.demandIds[0], 'z');
  assert.equal(f.starts, 1);
  assert.equal(f.exports, 1);
  disposeSharedStudyAudioPreparation(f.adapter);
  await assert.rejects(f.attached.exportCurrentAudioSource(), /disposed/);
});
test('pending startup uses the same helper; final disposal fences late source return', async () => {
  let release, finish;
  const loading = new Promise((r) => (release = r)),
    writing = new Promise((r) => (finish = r));
  const f = fixture({
    load: () => loading,
    exporter: async () => {
      await writing;
      return { demand: {}, currentSource: {} };
    },
  });
  const start = f.attached.ensureAudioPreparation({ build, grammarRecords: [] });
  assert.equal(typeof f.attached.exportCurrentAudioSource, 'function');
  const exporting = f.attached.exportCurrentAudioSource({ limit: 1 });
  release(f.canonical);
  await start;
  await new Promise((r) => setImmediate(r));
  assert.equal(f.starts, 1);
  assert.equal(f.exports, 1);
  disposeSharedStudyAudioPreparation(f.adapter);
  finish();
  await assert.rejects(exporting, /disposed/);
});
test('canonical rejection is preserved and no replacement observer is created', async () => {
  const f = fixture({
    exporter: async () => {
      throw Error('audio-demand-revision-changed');
    },
  });
  await f.attached.ensureAudioPreparation({ build, grammarRecords: [] });
  assert.equal(typeof f.attached.exportCurrentAudioSource, 'function');
  await assert.rejects(f.attached.exportCurrentAudioSource({ limit: 1 }), /revision.changed/);
  assert.equal(f.starts, 1);
  assert.equal(f.exports, 1);
  disposeSharedStudyAudioPreparation(f.adapter);
});
