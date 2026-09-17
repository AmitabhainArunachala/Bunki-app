/** Browser transactions against staged RecordApp/Host/Controller and real IDB.
 * Every origin, writer, account and record is an isolated synthetic fixture. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import {
  resolveCorridorEvidence,
  resolveCorridorSite,
} from '../../../scripts/resolve-corridor-site.mjs';
import { verifyBundledArtifact } from '../../bunki-desktop/lib/artifact.cjs';

const EVIDENCE = resolveCorridorEvidence();
const expectedArtifact = process.env.KAIRO_ARTIFACT_SHA256;
let SITE;
if (expectedArtifact === undefined) SITE = resolveCorridorSite();
else {
  assert(
    /^[0-9a-f]{64}$/u.test(expectedArtifact),
    'Explicit immutable artifact digest must be SHA256',
  );
  assert(
    process.env.KAIRO_SITE_DIR && isAbsolute(process.env.KAIRO_SITE_DIR),
    'Explicit artifact verification needs an absolute staged site',
  );
  SITE = resolve(process.env.KAIRO_SITE_DIR);
  assert.equal(verifyBundledArtifact(SITE).artifactSha256, expectedArtifact);
}
const ENGINES =
  process.env.KAIRO_BROWSER === 'all'
    ? ['chromium', 'webkit']
    : [process.env.KAIRO_BROWSER || 'chromium'];
const FILTER = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
assert(ENGINES.every((engine) => ['chromium', 'webkit'].includes(engine)));
const names = [
  'record-app.mjs',
  'record-host.mjs',
  'record-controller.mjs',
  'modules/record-core.mjs',
];
const assets = new Map(names.map((name) => [name, readFileSync(resolve(SITE, name))]));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8'));
for (const [name, bytes] of assets)
  assert.equal(manifest.files.find((file) => file.path === name)?.sha256, sha(bytes));
const pageHtml = `<!doctype html><meta charset="utf-8"><title>Synthetic record app</title>
<script type="module">
import * as controller from '/record-controller.mjs';
import * as core from '/modules/record-core.mjs';
import * as host from '/record-host.mjs';
import * as app from '/record-app.mjs';
window.fixture = { controller, core, host, app };
</script>`;
const server = createServer((request, response) => {
  response.setHeader('cache-control', 'no-store');
  if (request.url === '/fixture') {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(pageHtml);
    return;
  }
  const bytes = assets.get(request.url?.slice(1));
  if (bytes) {
    response.setHeader('content-type', 'text/javascript; charset=utf-8');
    response.end(bytes);
    return;
  }
  response.writeHead(404).end();
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

// Playwright's object codec drops own __proto__ keys. Exact JSON is the actual
// storage contract; only locally authored fixture function source is executed.
async function exact(page, action, input) {
  const text = await page.evaluate(
    async ({ source, argument }) => {
      const run = (0, eval)(`(${source})`);
      return JSON.stringify({ value: await run(JSON.parse(argument).value) });
    },
    { source: String(action), argument: JSON.stringify({ value: input }) },
  );
  return JSON.parse(text).value;
}
const policy = {
  binding: {
    accountId: 'app-fixture-account',
    learnerId: 'app-fixture-learner',
    sessionId: 'app-fixture-session',
  },
  schemaEpoch: 1,
  deletionEpoch: 0,
  mergePolicy: 'kairo-conservative-merge/1',
};
const actor = { deviceId: 'app-fixture-mac', incarnationId: 'app-fixture-install' };
const record = JSON.parse(
  '{"v":1,"taken":[],"srs":{},"revlog":[],"obslog":[],"__proto__":{"keep":"own-data"},"constructor":{"keep":"original"},"unknown":{"emoji":"日本🧪","future":[1,{"keep":true}]},"driftState":{"format":"kairo-drift-state","version":1,"store":{"synthetic":true,"count":0}}}',
);
const turns = [
  {
    id: Number.MAX_SAFE_INTEGER,
    surface: 'chat',
    role: 'user',
    content: 'Original synthetic question',
    ts: 20,
  },
  {
    id: '__proto__',
    surface: 'chat',
    role: 'assistant',
    content: 'Original synthetic answer',
    ts: 19,
  },
];

async function initialize(page, { seed = true, active = true } = {}) {
  await page.goto(`${origin}/fixture`);
  await page.waitForFunction(() => !!window.fixture);
  await exact(
    page,
    async ({ seed, active, policy, actor, record, turns }) => {
      const f = window.fixture;
      if (seed) {
        localStorage.setItem('kairo-corridor-v1', JSON.stringify(record));
        const db = await new Promise((done, fail) => {
          const request = indexedDB.open('kairo-ai-log', 3);
          request.onupgradeneeded = () => {
            const rows = request.result.createObjectStore('turns', {
              keyPath: 'id',
              autoIncrement: true,
            });
            rows.createIndex('logical-id', 'turn.id');
            request.result.createObjectStore('imports', { keyPath: 'id' });
          };
          request.onsuccess = () => done(request.result);
          request.onerror = () => fail(request.error);
        });
        await new Promise((done, fail) => {
          const tx = db.transaction('turns', 'readwrite');
          turns.forEach((turn, index) =>
            tx.objectStore('turns').put({ format: 'kairo-archive-row', v: 1, id: index + 1, turn }),
          );
          tx.oncomplete = done;
          tx.onabort = () => fail(tx.error);
        });
        db.close();
      }
      let token = { ownerId: crypto.randomUUID(), epoch: 1, sessionId: policy.binding.sessionId };
      let held = false;
      let release;
      await new Promise((done, fail) => {
        navigator.locks
          .request(
            'kairo-record:kairo-corridor-v1:kairo-ai-log',
            { mode: 'exclusive', ifAvailable: true },
            async (lock) => {
              if (!lock) {
                fail(new Error('Synthetic fixture did not acquire writer'));
                return;
              }
              held = true;
              const lifetime = new Promise((resolve) => {
                release = resolve;
              });
              done();
              await lifetime;
            },
          )
          .catch(fail);
      });
      f.release = () => {
        if (!held) return;
        held = false;
        token = { ...token, epoch: token.epoch + 1 };
        release();
      };
      addEventListener('pagehide', f.release, { once: true });
      f.assertCalls = 0;
      f.revokeAfterAssert = null;
      f.writer = {
        capture: () => ({ ...token }),
        assert: (captured) => {
          const valid =
            held &&
            captured.ownerId === token.ownerId &&
            captured.epoch === token.epoch &&
            captured.sessionId === token.sessionId;
          f.assertCalls++;
          if (valid && f.assertCalls === f.revokeAfterAssert) {
            f.revokedAt = f.assertCalls;
            f.release();
          }
          return valid;
        },
      };
      f.policy = policy;
      f.actor = actor;
      f.instance = await f.controller.createRecordController({
        databaseName: 'record-app-fixture',
        policy,
        actor,
        writer: f.writer,
      });
      if (seed) {
        const source = await f.controller.captureLegacySource(f.writer);
        const prepared = await f.instance.prepare(source, {
          migrationId: 'record-app-fixture-migration',
        });
        if (prepared.status !== 'prepared') throw new Error(`Fixture prepare: ${prepared.status}`);
        if (
          active &&
          (await f.instance.activate('record-app-fixture-migration')).status !== 'active'
        )
          throw new Error('Fixture activation failed');
      }
      f.published = [];
      f.producerCalls = 0;
      f.publishMode = 'normal';
      f.validateRecord = (value) =>
        value?.v === 1 &&
        Array.isArray(value.taken) &&
        (value.obslog === undefined || Array.isArray(value.obslog)) &&
        !value.invalidFixture;
      f.validateArchive = (rows) =>
        Array.isArray(rows) &&
        rows.every(
          (turn) =>
            ['user', 'assistant', 'tutor', 'app'].includes(turn.role) &&
            typeof turn.content === 'string' &&
            ['chat', 'tutor'].includes(turn.surface) &&
            Number.isSafeInteger(turn.ts) &&
            turn.ts > 0,
        );
      f.options = {
        controller: f.instance,
        binding: policy.binding,
        writer: f.writer,
        validateRecord: f.validateRecord,
        validateArchive: f.validateArchive,
        onPublish: (ack) => {
          f.publishAssertCount = f.assertCalls;
          if (f.publishMode === 'throw') throw new Error('Synthetic publication failure');
          if (f.publishMode === 'throw-null') throw null;
          if (f.publishMode === 'async')
            return Promise.reject(new Error('Synthetic asynchronous publication failure'));
          f.published.push({ changeId: ack.receipt.changeId, revision: ack.snapshot.revision });
        },
      };
      f.adapter = await f.app.createRecordApp(f.options);
      // An independent host uses the real controller's methods captured before
      // test interposition, so races commit through real IDB and revision CAS.
      f.realSnapshot = f.instance.snapshot.bind(f.instance);
      f.realCommit = f.instance.commitLocal.bind(f.instance);
      f.realRestore = f.instance.commitRestore.bind(f.instance);
      f.other = await f.host.createRecordHost({
        ...f.options,
        controller: { snapshot: f.realSnapshot, commitLocal: f.realCommit },
        reducers: { 'fixture.patch/1': (_, input) => input },
      });
      f.external = (patch, appendArchive = []) =>
        f.other.dispatch({
          changeId: crypto.randomUUID(),
          occurredAt: new Date().toISOString(),
          type: 'fixture.patch/1',
          input: { patch, appendArchive },
        });
      f.targetDisk = async () => {
        const db = await new Promise((done, fail) => {
          const request = indexedDB.open('record-app-fixture');
          request.onsuccess = () => done(request.result);
          request.onerror = () => fail(request.error);
        });
        try {
          return await new Promise((done, fail) => {
            const tx = db.transaction('kairo_replication_rows', 'readonly');
            const request = tx.objectStore('kairo_replication_rows').getAll();
            tx.oncomplete = () => done(request.result);
            tx.onabort = () => fail(tx.error);
          });
        } finally {
          db.close();
        }
      };
      f.disk = async () => ({
        legacyText: localStorage.getItem('kairo-corridor-v1'),
        target: await f.targetDisk(),
      });
      f.holdCommit = () => {
        let enter;
        let release;
        f.entered = new Promise((done) => {
          enter = done;
        });
        const hold = new Promise((done) => {
          release = done;
        });
        f.releaseCommit = release;
        let once = true;
        f.instance.commitLocal = async (request) => {
          if (once) {
            once = false;
            f.heldRequest = request;
            enter();
            await hold;
          }
          return f.realCommit(request);
        };
      };
      f.atSnapshot = (number, action) => {
        let count = 0;
        f.snapshotRaceFired = false;
        f.instance.snapshot = async () => {
          count++;
          if (count === number) {
            f.snapshotRaceFired = true;
            await action();
          }
          return f.realSnapshot();
        };
      };
      f.quota = () => {
        const put = window.IDBObjectStore.prototype.put;
        let armed = true;
        f.quotaFired = false;
        window.IDBObjectStore.prototype.put = function (...args) {
          const request = put.apply(this, args);
          if (
            armed &&
            this.transaction.db.name === 'record-app-fixture' &&
            this.name === 'kairo_replication_rows' &&
            args[0]?.kind === 'document' &&
            JSON.parse(args[0].text).collection === 'kairo:record-host-commands'
          ) {
            armed = false;
            f.quotaFired = true;
            throw new DOMException('Synthetic quota after real record puts', 'QuotaExceededError');
          }
          return request;
        };
        f.disarm = () => {
          armed = false;
          window.IDBObjectStore.prototype.put = put;
        };
      };
    },
    { seed, active, policy, actor, record, turns },
  );
}

async function remoteJournalBackup(page) {
  return exact(page, async () => {
    const f = window.fixture;
    const target = (await f.realSnapshot()).snapshot;
    const source = await f.core.IndexedDbReplicationStore.open({
      databaseName: 'app-backup-source',
      policy: {
        ...target.policy,
        binding: { ...target.policy.binding, sessionId: 'source-session' },
      },
      actor: { deviceId: 'backup-phone', incarnationId: 'backup-installation' },
    });
    try {
      const current = await source.snapshot();
      await source.commitLocal({
        changeId: 'original-backup-note',
        binding: current.policy.binding,
        expectedRevision: current.revision,
        occurredAt: '2026-09-10T00:00:00.000Z',
        mutations: [],
        operations: [
          {
            dependencies: [],
            payload: {
              kind: 'note.version',
              noteId: 'backup-note',
              versionId: 'backup-version',
              generation: null,
              supersedes: [],
              segments: [{ kind: 'original', text: 'Original offline backup note' }],
            },
          },
        ],
      });
      const journal = f.core.exportOperationJournal((await source.snapshot()).replica);
      const preview = await f.adapter.exportBackup();
      const backup = structuredClone(preview.backup);
      backup.version = 2;
      backup.journal = journal;
      backup.counts.syncOperations = journal.operations.length;
      backup.record.restoredUnknown = { original: ['complete portable root', { keep: true }] };
      backup.archive.turns[0].content = 'Restored archive accompanies operation journal';
      for (const key of ['record', 'archive', 'journal'])
        backup.sha256[key] = f.core.encodeLocalJson(backup[key]).sha256;
      return { backup, revision: preview.revision };
    } finally {
      await source.close();
    }
  });
}

const all = [];
try {
  for (const engine of ENGINES) {
    const OUT = ENGINES.length > 1 ? resolve(EVIDENCE, engine) : EVIDENCE;
    mkdirSync(OUT, { recursive: true });
    const browser = await { chromium, webkit }[engine].launch(
      engine === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || undefined } : {},
    );
    const browserVersion = browser.version();
    const results = [];
    const errors = [];
    const network = [];
    const startedAt = new Date().toISOString();
    async function test(name, action, options = {}) {
      if (FILTER && FILTER !== name) return;
      const start = Date.now();
      const context = await browser.newContext({ serviceWorkers: 'block' });
      context.on('page', (page) =>
        page.on('pageerror', (error) => errors.push({ name, message: error.message })),
      );
      await context.route('**/*', (route) => {
        const requested = new URL(route.request().url());
        if (requested.origin === origin) return route.continue();
        network.push({ name, origin: requested.origin });
        return route.abort();
      });
      let timer;
      try {
        const page = await context.newPage();
        await initialize(page, options);
        await Promise.race([
          action({ page, context }),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Scenario timed out')),
              options.timeoutMs || 25_000,
            );
          }),
        ]);
        results.push({ name, status: 'passed', elapsedMs: Date.now() - start });
      } catch (error) {
        results.push({
          name,
          status: 'failed',
          error: String(error.stack || error),
          elapsedMs: Date.now() - start,
        });
      } finally {
        clearTimeout(timer);
        await context.close();
        process.stdout.write(`${engine} ${results.at(-1).status}: ${name}\n`);
      }
    }
    try {
      await test('immutable-current-preserves-own-keys-without-publishing-boot-effects', async ({
        page,
      }) => {
        const observed = await exact(page, () => {
          const f = window.fixture;
          const current = f.adapter.current();
          return {
            current,
            frozen:
              Object.isFrozen(current) &&
              Object.isFrozen(current.snapshot.record) &&
              Object.isFrozen(current.snapshot.record.unknown.future[1]),
            nullPrototype: Object.getPrototypeOf(current.snapshot.record) === null,
            ownProto: Object.hasOwn(current.snapshot.record, '__proto__'),
            published: f.published,
            pending: f.adapter.pending,
          };
        });
        assert.equal(observed.current.status, 'active');
        assert.equal(observed.frozen, true);
        assert.equal(observed.nullPrototype, true);
        assert.equal(observed.ownProto, true);
        assert.deepEqual(observed.current.snapshot.record, record);
        assert.deepEqual(observed.current.snapshot.archive.turns, turns);
        assert.deepEqual(observed.published, []);
        assert.equal(observed.pending, 0);
      });
      await test('queued-producers-see-latest-committed-state-and-pending-never-publishes-proposals', async ({
        page,
      }) => {
        const held = await exact(page, async () => {
          const f = window.fixture;
          f.holdCommit();
          f.seen = [];
          const producer = (record) => {
            f.producerCalls++;
            f.seen.push(record.obslog.length);
            return { patch: { obslog: [...record.obslog, [f.producerCalls, 'queued']] } };
          };
          f.one = f.adapter.write(producer);
          f.two = f.adapter.write(producer);
          const immediate = { calls: f.producerCalls, pending: f.adapter.pending };
          await f.entered;
          return {
            immediate,
            seen: f.seen,
            pending: f.adapter.pending,
            current: f.adapter.current(),
            request: f.heldRequest,
            published: f.published,
          };
        });
        assert.deepEqual(held.immediate, { calls: 0, pending: 2 });
        assert.deepEqual(held.seen, [0]);
        assert.equal(held.pending, 2);
        assert.deepEqual(held.current.snapshot.record.obslog, []);
        assert.deepEqual(held.published, []);
        assert.deepEqual(held.request.operations, []);
        const finished = await exact(page, async () => {
          const f = window.fixture;
          f.releaseCommit();
          return {
            acknowledgements: await Promise.all([f.one, f.two]),
            seen: f.seen,
            pending: f.adapter.pending,
            published: f.published,
            target: (await f.realSnapshot()).snapshot,
          };
        });
        assert.deepEqual(finished.seen, [0, 1]);
        assert.equal(finished.pending, 0);
        assert.equal(finished.published.length, 2);
        assert.deepEqual(finished.acknowledgements[1].snapshot.record.obslog, [
          [1, 'queued'],
          [2, 'queued'],
        ]);
        assert.equal(new Set(finished.acknowledgements.map((ack) => ack.receipt.changeId)).size, 2);
        for (const ack of finished.acknowledgements) assert.equal(ack.receipt.outcome, 'committed');
        assert.equal(finished.target.outbox.length, 0);
        assert.equal(finished.target.actor.sequence, 0);
        assert.equal(finished.target.replica.operations.length, 0);
      });
      await test('atomic-drift-and-observation-patch-with-archive-keeps-all-other-own-roots', async ({
        page,
      }) => {
        const result = await exact(page, () =>
          window.fixture.adapter.write((record) => ({
            patch: {
              driftState: { ...record.driftState, store: { ...record.driftState.store, count: 1 } },
              obslog: [[1, 'drift interaction']],
            },
            appendArchive: [
              { role: 'app', surface: 'tutor', content: 'Atomic synthetic observation', ts: 18 },
            ],
          })),
        );
        assert.equal(result.status, 'active');
        const expected = structuredClone(record);
        expected.driftState.store.count = 1;
        expected.obslog = [[1, 'drift interaction']];
        assert.deepEqual(result.snapshot.record, expected);
        assert.deepEqual(result.snapshot.archive.turns.slice(0, 2), turns);
        assert.equal(result.snapshot.archive.turns.length, 3);
        assert.equal(typeof result.snapshot.archive.turns[2].id, 'string');
      });
      await test('archive-and-observation-appends-export-in-order-without-clock-based-reordering', async ({
        page,
      }) => {
        const result = await exact(page, async () => {
          const f = window.fixture;
          const archive = f.adapter.appendArchive([
            { role: 'user', surface: 'chat', content: 'Later call, earlier timestamp', ts: 1 },
          ]);
          const obs = f.adapter.appendObservations([[3, 'observation']]);
          const backup = f.adapter.exportBackup();
          return {
            archive: await archive,
            obs: await obs,
            exported: await backup,
            published: f.published.length,
          };
        });
        assert.equal(result.exported.revision, result.obs.receipt.committedRevision);
        assert.equal(result.published, 2);
        assert.deepEqual(result.exported.backup.archive.turns.slice(0, 2), turns);
        assert.equal(result.exported.backup.archive.turns[2].ts, 1);
        assert.deepEqual(result.exported.backup.record.obslog, [[3, 'observation']]);
      });
      await test('producer-errors-invalid-results-and-capacity-refuse-without-any-write', async ({
        page,
      }) => {
        const observed = await exact(page, async () => {
          const f = window.fixture;
          const before = await f.disk();
          const failures = [];
          const producers = [
            () => {
              throw new Error('Original producer failure');
            },
            (record) => {
              record.unknown.future.push('mutation');
              return { patch: {} };
            },
            async () => {
              throw new Error('Rejected async producer');
            },
            () => ({ patch: {}, unexpected: true }),
            () => ({ patch: { invalidFixture: true } }),
            () => ({ patch: { ai: { key: 'SYNTHETIC-REJECTED' } } }),
            () => ({
              patch: Object.fromEntries(
                Array.from({ length: 257 }, (_, index) => [`root${index}`, index]),
              ),
            }),
            () => ({ patch: { ['r'.repeat(257)]: true } }),
            () => ({ patch: { unknown: undefined } }),
            () => ({ patch: {}, appendArchive: {} }),
            () => ({
              patch: { onlyIfCommitted: true },
              appendArchive: [
                { role: 'wrong', surface: 'chat', content: 'Invalid domain turn', ts: 1 },
              ],
            }),
          ];
          for (const producer of producers) {
            try {
              await f.adapter.write(producer);
              failures.push('unexpected success');
            } catch (error) {
              failures.push(error.code || error.message);
            }
          }
          await new Promise((done) => setTimeout(done, 0));
          return {
            failures,
            before,
            after: await f.disk(),
            published: f.published.length,
            pending: f.adapter.pending,
          };
        });
        assert.equal(observed.failures.length, 11);
        assert(!observed.failures.includes('unexpected success'));
        assert(observed.failures.includes('async-producer'));
        assert.deepEqual(observed.after, observed.before);
        assert.equal(observed.published, 0);
        assert.equal(observed.pending, 0);
      });
      await test('independent-host-root-and-archive-change-before-dequeue-merge-without-loss', async ({
        page,
      }) => {
        const result = await exact(page, async () => {
          const f = window.fixture;
          f.atSnapshot(2, () =>
            f.external({ externalRoot: 'retained' }, [
              { role: 'assistant', surface: 'chat', content: 'Other host append', ts: 2 },
            ]),
          );
          const ack = await f.adapter.write(() => ({
            patch: { appRoot: 'added' },
            appendArchive: [{ role: 'user', surface: 'chat', content: 'App append', ts: 1 }],
          }));
          return { ack, fired: f.snapshotRaceFired };
        });
        assert.equal(result.fired, true);
        assert.equal(result.ack.status, 'active');
        assert.equal(result.ack.snapshot.record.externalRoot, 'retained');
        assert.equal(result.ack.snapshot.record.appRoot, 'added');
        assert.deepEqual(
          result.ack.snapshot.archive.turns.slice(2).map((turn) => turn.content),
          ['Other host append', 'App append'],
        );
      });
      await test('same-root-value-or-presence-conflict-rejects-stale-patch-without-reexecuting-producer', async ({
        page,
      }) => {
        const result = await exact(page, async () => {
          const f = window.fixture;
          const outcomes = [];
          for (const patch of [{ obslog: [[1, 'other']] }, { newRoot: null }]) {
            f.atSnapshot(2, () => f.external(patch));
            let failure;
            try {
              await f.adapter.write(() => {
                f.producerCalls++;
                return {
                  patch: Object.fromEntries(
                    Object.keys(patch).map((key) => [key, key === 'obslog' ? [] : 'stale']),
                  ),
                };
              });
            } catch (error) {
              failure = error.code;
            }
            outcomes.push({ failure, fired: f.snapshotRaceFired });
          }
          return {
            outcomes,
            calls: f.producerCalls,
            published: f.published.length,
            snapshot: (await f.realSnapshot()).snapshot,
          };
        });
        assert.deepEqual(result.outcomes, [
          { failure: 'stale-patch', fired: true },
          { failure: 'stale-patch', fired: true },
        ]);
        assert.equal(result.calls, 2);
        assert.equal(result.published, 0);
        const stored = result.snapshot.documents.find(
          (row) => row.collection === 'learner-record',
        ).value;
        assert.deepEqual(stored.obslog, [[1, 'other']]);
        assert.equal(stored.newRoot, null);
        assert.equal(
          result.snapshot.documents.filter((row) => row.collection === 'kairo:record-host-commands')
            .length,
          2,
        );
      });
      await test('revision-cas-after-reduction-refuses-without-retry-or-silent-overwrite', async ({
        page,
      }) => {
        const result = await exact(page, async () => {
          const f = window.fixture;
          let raced = false;
          f.instance.commitLocal = async (request) => {
            if (!raced) {
              raced = true;
              await f.external({ externalAfterRead: true });
            }
            return f.realCommit(request);
          };
          const ack = await f.adapter.write(() => {
            f.producerCalls++;
            return { patch: { rejectedCas: true } };
          });
          return {
            ack,
            calls: f.producerCalls,
            raced,
            published: f.published.length,
            latest: (await f.realSnapshot()).snapshot,
          };
        });
        assert.equal(result.raced, true);
        assert.equal(result.ack.status, 'recovery-required');
        assert.equal(result.calls, 1);
        assert.equal(result.published, 0);
        const stored = result.latest.documents.find(
          (row) => row.collection === 'learner-record',
        ).value;
        assert.equal(stored.externalAfterRead, true);
        assert(!Object.hasOwn(stored, 'rejectedCas'));
      });
      await test('real-quota-abort-keeps-target-and-proposal-unpublished', async ({ page }) => {
        const result = await exact(page, async () => {
          const f = window.fixture;
          const before = await f.disk();
          f.quota();
          const ack = await f.adapter.write(() => {
            f.producerCalls++;
            return {
              patch: { quotaProposal: true },
              appendArchive: [
                { role: 'user', surface: 'chat', content: 'Must abort with record', ts: 1 },
              ],
            };
          });
          f.disarm();
          return {
            ack,
            fired: f.quotaFired,
            calls: f.producerCalls,
            before,
            after: await f.disk(),
            published: f.published.length,
          };
        });
        assert.equal(result.fired, true);
        assert.equal(result.ack.status, 'recovery-required');
        assert.equal(result.calls, 1);
        assert.deepEqual(result.after, result.before);
        assert.equal(result.published, 0);
      });
      await test('lost-acknowledgement-reload-recovers-one-durable-change-without-ui-replay', async ({
        page,
      }) => {
        const failed = await exact(page, async () => {
          const f = window.fixture;
          f.instance.commitLocal = async (request) => {
            await f.realCommit(request);
            throw new Error('Synthetic lost acknowledgement');
          };
          const ack = await f.adapter.write(() => {
            f.producerCalls++;
            return { patch: { uncertainCounter: 1 } };
          });
          return { ack, calls: f.producerCalls, published: f.published.length };
        });
        assert.equal(failed.ack.status, 'recovery-required');
        assert.equal(failed.calls, 1);
        assert.equal(failed.published, 0);
        await initialize(page, { seed: false });
        const recovered = await exact(page, async () => ({
          current: await window.fixture.adapter.snapshot(),
          published: window.fixture.published.length,
          target: (await window.fixture.realSnapshot()).snapshot,
        }));
        assert.equal(recovered.current.status, 'active');
        assert.equal(recovered.current.snapshot.record.uncertainCounter, 1);
        assert.equal(recovered.published, 0);
        assert.equal(
          recovered.target.documents.filter(
            (row) => row.collection === 'kairo:record-host-commands',
          ).length,
          1,
        );
      });
      await test('actual-duplicate-target-receipt-never-replays-publication-callback', async ({
        page,
      }) => {
        const result = await exact(page, async () => {
          const f = window.fixture;
          f.instance.commitLocal = async (request) => {
            await f.realCommit(request);
            return f.realCommit(request);
          };
          const ack = await f.adapter.write(() => {
            f.producerCalls++;
            return { patch: { duplicateCounter: 1 } };
          });
          return {
            ack,
            calls: f.producerCalls,
            published: f.published.length,
            target: (await f.realSnapshot()).snapshot,
          };
        });
        assert.equal(result.ack.status, 'active');
        assert.equal(result.ack.receipt.outcome, 'duplicate');
        assert.equal(result.ack.replayUiEffects, false);
        assert.equal(result.calls, 1);
        assert.equal(result.published, 0);
        assert.equal(result.ack.snapshot.record.duplicateCounter, 1);
        assert.equal(
          result.target.documents.filter((row) => row.collection === 'kairo:record-host-commands')
            .length,
          1,
        );
      });
      await test('writer-loss-between-host-confirmation-and-app-publication-keeps-durable-receipt', async ({
        page,
      }) => {
        const result = await exact(page, async () => {
          const f = window.fixture;
          f.assertCalls = 0;
          const baseline = await f.adapter.write(() => ({ patch: { baseline: 1 } }));
          const beforePublication = f.publishAssertCount - 2;
          f.assertCalls = 0;
          f.revokeAfterAssert = beforePublication;
          const ack = await f.adapter.write(() => ({ patch: { durableAtOwnerLoss: true } }));
          return {
            baseline,
            ack,
            beforePublication,
            revokedAt: f.revokedAt,
            published: f.published.length,
            disk: await f.targetDisk(),
          };
        });
        assert.equal(result.baseline.status, 'active');
        assert.equal(result.revokedAt, result.beforePublication);
        assert.equal(result.ack.status, 'recovery-required');
        assert.equal(result.ack.targetCommitDurable, true);
        assert.equal(result.published, 1);
        assert(
          result.disk.some(
            (row) =>
              row.kind === 'document' &&
              JSON.parse(row.text).collection === 'learner-record' &&
              JSON.parse(row.text).value.durableAtOwnerLoss === true,
          ),
        );
      });
      await test('queued-old-owner-producer-never-runs-after-first-durable-commit-loses-writer', async ({
        page,
      }) => {
        const result = await exact(page, async () => {
          const f = window.fixture;
          f.instance.commitLocal = async (request) => {
            const outcome = await f.realCommit(request);
            f.release();
            return outcome;
          };
          const one = f.adapter.write(() => ({ patch: { firstDurable: true } }));
          const two = f.adapter.write(() => {
            f.producerCalls++;
            return { patch: { forbiddenNextOwner: true } };
          });
          return {
            outcomes: await Promise.all([one, two]),
            calls: f.producerCalls,
            published: f.published.length,
          };
        });
        assert(result.outcomes.every((outcome) => outcome.status === 'recovery-required'));
        assert.equal(result.outcomes[0].targetCommitDurable, true);
        assert.equal(result.calls, 0);
        assert.equal(result.published, 0);
      });
      await test('publication-exception-retains-committed-receipt-and-does-not-retry', async ({
        page,
      }) => {
        const results = await exact(page, async () => {
          const f = window.fixture;
          const results = [];
          for (const mode of ['throw', 'throw-null']) {
            f.publishMode = mode;
            const ack = await f.adapter.write(() => {
              f.producerCalls++;
              return { patch: { committedBeforeUiFailure: true } };
            });
            results.push({ ack, calls: f.producerCalls, current: f.adapter.current() });
          }
          return results;
        });
        for (const [index, result] of results.entries()) {
          assert.equal(result.ack.status, 'recovery-required');
          assert.equal(result.ack.reason, 'publication-failed');
          assert.equal(result.ack.targetCommitDurable, true);
          assert.equal(result.ack.receipt.outcome, 'committed');
          assert.equal(result.calls, index + 1);
          assert.equal(result.current.snapshot.record.committedBeforeUiFailure, true);
        }
      });
      await test(
        'large-durable-record-publication-failure-returns-one-bounded-recovery-snapshot',
        async ({ page }) => {
          const result = await exact(page, async () => {
            const f = window.fixture;
            f.publishMode = 'throw';
            try {
              const ack = await f.adapter.write(() => ({
                patch: { largeFixture: 'x'.repeat(17 * 1024 * 1024) },
              }));
              return {
                status: ack.status,
                reason: ack.reason,
                durable: ack.targetCommitDurable,
                receipt: ack.receipt,
                size: ack.lastCommitted?.record.largeFixture.length,
                encodedSize: f.core.encodeLocalJson(ack).text.length,
              };
            } catch (error) {
              const current = f.adapter.current();
              return {
                rejected: error.code || error.message,
                currentStatus: current.status,
                committedSize: current.snapshot?.record.largeFixture?.length || 0,
              };
            }
          });
          assert.equal(result.status, 'recovery-required', JSON.stringify(result));
          assert.equal(result.reason, 'publication-failed');
          assert.equal(result.durable, true);
          assert.equal(result.receipt.outcome, 'committed');
          assert.equal(result.size, 17 * 1024 * 1024);
          assert(
            result.encodedSize < 18 * 1024 * 1024,
            'Recovery must retain one snapshot, not duplicate the whole record',
          );
        },
        { timeoutMs: 60_000 },
      );
      await test('async-publication-is-explicitly-refused-with-durable-receipt-and-no-unhandled-rejection', async ({
        page,
      }) => {
        const result = await exact(page, async () => {
          const f = window.fixture;
          f.publishMode = 'async';
          const ack = await f.adapter.write(() => ({ patch: { asyncPublicationDurable: true } }));
          await new Promise((done) => setTimeout(done, 0));
          return { ack, current: f.adapter.current() };
        });
        assert.equal(result.ack.status, 'recovery-required');
        assert.equal(result.ack.reason, 'async-publication');
        assert.equal(result.ack.targetCommitDurable, true);
        assert.equal(result.ack.receipt.outcome, 'committed');
        assert.equal(result.current.snapshot.record.asyncPublicationDurable, true);
      });
      await test('restore-matches-preview-and-allows-the-correctly-advanced-confirmation', async ({
        page,
      }) => {
        const result = await exact(page, async () => {
          const f = window.fixture;
          const preview = await f.adapter.exportBackup();
          const backup = structuredClone(preview.backup);
          backup.record.restoredRoot = true;
          backup.archive.turns = [];
          backup.counts.archiveTurns = 0;
          backup.sha256.record = f.core.encodeLocalJson(backup.record).sha256;
          backup.sha256.archive = f.core.encodeLocalJson(backup.archive).sha256;
          const ack = await f.adapter.restore(backup, { expectedRevision: preview.revision });
          return {
            ack,
            previewRevision: preview.revision,
            backup,
            exported: await f.adapter.exportBackup(),
            published: f.published.length,
          };
        });
        assert.equal(result.ack.status, 'active');
        assert.equal(result.ack.snapshot.revision, result.previewRevision + 1);
        assert.deepEqual(result.exported.backup, result.backup);
        assert.equal(result.published, 1);
      });
      await test('restore-superseded-by-an-earlier-queued-write-is-rejected-before-replacement', async ({
        page,
      }) => {
        const result = await exact(page, async () => {
          const f = window.fixture;
          const preview = await f.adapter.exportBackup();
          const write = f.adapter.write(() => ({ patch: { queuedBeforeRestore: true } }));
          const restore = f.adapter.restore(preview.backup, { expectedRevision: preview.revision });
          return {
            write: await write,
            restore: await restore,
            target: (await f.realSnapshot()).snapshot,
            published: f.published.length,
          };
        });
        assert.equal(result.write.status, 'active');
        assert.equal(result.restore.status, 'recovery-required');
        assert.equal(result.restore.reason, 'restore-superseded');
        assert.equal(result.published, 1);
        assert.equal(
          result.target.documents.filter((row) => row.collection === 'kairo:record-host-commands')
            .length,
          1,
        );
        assert.equal(
          result.target.documents.find((row) => row.collection === 'learner-record').value
            .queuedBeforeRestore,
          true,
        );
      });
      await test('restore-checks-other-host-revision-at-actual-dequeue', async ({ page }) => {
        const result = await exact(page, async () => {
          const f = window.fixture;
          const preview = await f.adapter.exportBackup();
          f.atSnapshot(1, () => f.external({ externalBeforeRestoreRead: true }));
          const ack = await f.adapter.restore(preview.backup, {
            expectedRevision: preview.revision,
          });
          return {
            ack,
            fired: f.snapshotRaceFired,
            target: (await f.realSnapshot()).snapshot,
            published: f.published.length,
          };
        });
        assert.equal(result.fired, true);
        assert.equal(result.ack.status, 'recovery-required');
        assert.equal(result.ack.reason, 'restore-superseded');
        assert.equal(result.published, 0);
        assert.equal(
          result.target.documents.find((row) => row.collection === 'learner-record').value
            .externalBeforeRestoreRead,
          true,
        );
      });
      await test('restore-cas-refuses-external-revision-between-read-and-commit', async ({
        page,
      }) => {
        const result = await exact(page, async () => {
          const f = window.fixture;
          const preview = await f.adapter.exportBackup();
          let raced = false;
          f.instance.commitLocal = async (request) => {
            raced = true;
            await f.external({ externalBeforeRestoreCommit: true });
            return f.realCommit(request);
          };
          const ack = await f.adapter.restore(preview.backup, {
            expectedRevision: preview.revision,
          });
          return {
            ack,
            raced,
            target: (await f.realSnapshot()).snapshot,
            published: f.published.length,
          };
        });
        assert.equal(result.raced, true);
        assert.equal(result.ack.status, 'recovery-required');
        assert.equal(result.published, 0);
        assert.equal(
          result.target.documents.find((row) => row.collection === 'learner-record').value
            .externalBeforeRestoreCommit,
          true,
        );
        assert.equal(
          result.target.documents.filter((row) => row.collection === 'kairo:record-host-commands')
            .length,
          1,
        );
      });
      await test('v2-lost-ack-reopen-preserves-complete-backup-without-publication-replay', async ({
        page,
      }) => {
        const preview = await remoteJournalBackup(page);
        const failed = await exact(
          page,
          async (preview) => {
            const f = window.fixture;
            let calls = 0;
            f.instance.commitRestore = async (request) => {
              calls++;
              await f.realRestore(request);
              throw new Error('Synthetic lost v2 host acknowledgement after durable restore');
            };
            const ack = await f.adapter.restore(preview.backup, {
              expectedRevision: preview.revision,
            });
            return { ack, calls, current: f.adapter.current(), published: f.published.length };
          },
          preview,
        );
        assert.equal(failed.calls, 1);
        assert.equal(failed.ack.status, 'recovery-required');
        assert.equal(failed.published, 0);
        assert.equal(failed.current.lastCommitted.record.restoredUnknown, undefined);
        await initialize(page, { seed: false });
        const reopened = await exact(page, async () => ({
          exported: await window.fixture.adapter.exportBackup(),
          target: (await window.fixture.realSnapshot()).snapshot,
          published: window.fixture.published.length,
        }));
        assert.deepEqual(reopened.exported.backup, preview.backup);
        assert.equal(reopened.exported.revision, preview.revision + 1);
        assert.equal(reopened.published, 0);
        assert.deepEqual(reopened.target.outbox, preview.backup.journal.operations);
        assert.equal(reopened.target.actor.sequence, 0);
        assert.equal(
          reopened.target.documents.filter((row) => row.collection === 'kairo:record-host-commands')
            .length,
          1,
        );
      });
      await test('v2-exact-target-retry-never-replays-app-publication', async ({ page }) => {
        const preview = await remoteJournalBackup(page);
        const result = await exact(
          page,
          async (preview) => {
            const f = window.fixture;
            let calls = 0;
            f.instance.commitRestore = async (request) => {
              calls++;
              const first = await f.realRestore(request);
              if (first.status !== 'active') throw new Error('Fixture first restore failed');
              return f.realRestore(request);
            };
            const ack = await f.adapter.restore(preview.backup, {
              expectedRevision: preview.revision,
            });
            return {
              ack,
              calls,
              published: f.published.length,
              target: (await f.realSnapshot()).snapshot,
              exported: await f.adapter.exportBackup(),
            };
          },
          preview,
        );
        assert.equal(result.calls, 1);
        assert.equal(result.ack.status, 'active');
        assert.equal(result.ack.receipt.type, 'host.restore/2');
        assert.equal(result.ack.receipt.outcome, 'duplicate');
        assert.equal(result.ack.replayUiEffects, false);
        assert.equal(result.published, 0);
        assert.equal(result.target.revision, preview.revision + 1);
        assert.equal(
          result.target.documents.filter((row) => row.collection === 'kairo:record-host-commands')
            .length,
          1,
        );
        assert.deepEqual(result.target.outbox, preview.backup.journal.operations);
        assert.deepEqual(result.exported.backup, preview.backup);
      });
      for (const boundary of ['dequeue', 'commit'])
        await test(`v2-preview-cas-denies-receive-at-${boundary}-without-record-or-journal-loss`, async ({
          page,
        }) => {
          const preview = await remoteJournalBackup(page);
          const result = await exact(
            page,
            async ({ preview, boundary }) => {
              const f = window.fixture;
              let calls = 0;
              let raced = false;
              let afterReceive;
              const receive = async () => {
                raced = true;
                const current = (await f.realSnapshot()).snapshot;
                const outcome = await f.instance.commitReceive({
                  deliveryId: 'preview-intervening-receive',
                  expectedRevision: current.revision,
                  delivery: {
                    binding: current.policy.binding,
                    operations: preview.backup.journal.operations,
                  },
                  checkpoint: {
                    channelId: 'preview-channel',
                    expected: null,
                    next: 'received-once',
                  },
                });
                if (outcome.status !== 'active') throw new Error('Fixture receive failed');
                afterReceive = await f.disk();
              };
              f.instance.commitRestore = async (request) => {
                calls++;
                if (boundary === 'commit') await receive();
                return f.realRestore(request);
              };
              if (boundary === 'dequeue') f.atSnapshot(1, receive);
              const ack = await f.adapter.restore(preview.backup, {
                expectedRevision: preview.revision,
              });
              return {
                ack,
                calls,
                raced,
                afterReceive,
                after: await f.disk(),
                target: (await f.realSnapshot()).snapshot,
                published: f.published.length,
                exported: await f.adapter.exportBackup(),
              };
            },
            { preview, boundary },
          );
          assert.equal(result.raced, true);
          assert.equal(result.calls, boundary === 'commit' ? 1 : 0);
          assert.equal(result.ack.status, 'recovery-required');
          if (boundary === 'dequeue') assert.equal(result.ack.reason, 'restore-superseded');
          assert.equal(result.published, 0);
          assert.deepEqual(result.after, result.afterReceive);
          assert.equal(result.target.revision, preview.revision + 1);
          assert.equal(
            result.target.documents.filter((row) => row.collection === 'kairo:record-host-commands')
              .length,
            0,
          );
          assert.equal(result.exported.backup.record.restoredUnknown, undefined);
          assert.deepEqual(result.exported.backup.journal, preview.backup.journal);
          assert.equal(result.target.inbox.length, 1);
          assert.equal(result.target.outbox.length, 0);
        });
      await test('restore-requires-valid-preview-and-full-backup-without-dropping-recovery-evidence', async ({
        page,
      }) => {
        const result = await exact(page, async () => {
          const f = window.fixture;
          const preview = await f.adapter.exportBackup();
          const before = await f.disk();
          const errors = [];
          for (const options of [
            {},
            { expectedRevision: -1 },
            { expectedRevision: preview.revision, extra: true },
          ]) {
            try {
              await f.adapter.restore(preview.backup, options);
              errors.push('unexpected success');
            } catch (error) {
              errors.push(error.code);
            }
          }
          try {
            await f.adapter.restore(
              { ...preview.backup, counts: { archiveTurns: 0 } },
              { expectedRevision: preview.revision },
            );
            errors.push('unexpected success');
          } catch (error) {
            errors.push(error.code);
          }
          f.instance.commitLocal = async (request) => {
            const committed = await f.realCommit(request);
            return {
              status: 'quarantined',
              reason: 'synthetic-source-diverged',
              targetCommitDurable: true,
              targetReceipt: committed.receipt,
            };
          };
          const unchanged = await f.disk();
          const ack = await f.adapter.restore(preview.backup, {
            expectedRevision: preview.revision,
          });
          return { errors, before, unchanged, ack, published: f.published.length };
        });
        assert.equal(result.errors.length, 4);
        assert(!result.errors.includes('unexpected success'));
        assert.deepEqual(result.unchanged, result.before);
        assert.equal(result.ack.status, 'recovery-required');
        assert.equal(result.ack.hostStatus, 'quarantined');
        assert.equal(result.ack.reason, 'synthetic-source-diverged');
        assert.equal(result.ack.targetCommitDurable, true);
        assert.equal(result.ack.targetReceipt.outcome, 'committed');
        assert.equal(result.published, 0);
      });
      await test(
        'inactive-controller-never-runs-producer-or-returns-an-active-backup',
        async ({ page }) => {
          const result = await exact(page, async () => {
            const f = window.fixture;
            const before = await f.disk();
            const write = await f.adapter.write(() => {
              f.producerCalls++;
              return { patch: { wrong: true } };
            });
            return {
              write,
              snapshot: await f.adapter.snapshot(),
              backup: await f.adapter.exportBackup(),
              restore: await f.adapter.restore({}, { expectedRevision: 0 }),
              before,
              after: await f.disk(),
              calls: f.producerCalls,
            };
          });
          for (const key of ['write', 'snapshot', 'backup', 'restore']) {
            assert.equal(result[key].status, 'recovery-required');
            assert.equal(result[key].hostStatus, 'prepared');
          }
          assert.deepEqual(result.after, result.before);
          assert.equal(result.calls, 0);
        },
        { active: false },
      );
      await test('close-cancels-queued-producers-but-retains-in-flight-durable-outcome', async ({
        page,
      }) => {
        const held = await exact(page, async () => {
          const f = window.fixture;
          f.holdCommit();
          f.one = f.adapter.write(() => ({ patch: { committedDuringClose: true } }));
          f.two = f.adapter
            .write(() => {
              f.producerCalls++;
              return { patch: { forbiddenAfterClose: true } };
            })
            .catch((error) => ({ rejected: error.code }));
          await f.entered;
          f.closed = f.adapter.close();
          return { pending: f.adapter.pending };
        });
        assert.equal(held.pending, 2);
        const result = await exact(page, async () => {
          const f = window.fixture;
          f.releaseCommit();
          const one = await f.one;
          const two = await f.two;
          await f.closed;
          return {
            one,
            two,
            calls: f.producerCalls,
            pending: f.adapter.pending,
            published: f.published.length,
            target: (await f.realSnapshot()).snapshot,
          };
        });
        assert.equal(result.one.status, 'recovery-required');
        assert.equal(result.one.targetCommitDurable, true);
        assert.equal(result.two.rejected, 'closed');
        assert.equal(result.calls, 0);
        assert.equal(result.pending, 0);
        assert.equal(result.published, 0);
        assert.equal(
          result.target.documents.find((row) => row.collection === 'learner-record').value
            .committedDuringClose,
          true,
        );
      });
    } finally {
      await browser.close();
      for (const [name, bytes] of assets)
        assert.equal(
          sha(readFileSync(resolve(SITE, name))),
          sha(bytes),
          `Tested staged asset changed: ${name}`,
        );
      const receipt = {
        schemaVersion: 1,
        engine,
        browserVersion,
        startedAt,
        finishedAt: new Date().toISOString(),
        site: SITE,
        artifactSha256: manifest.artifactSha256,
        sourceAssetSha256: manifest.sourceAssetSha256,
        verificationMode:
          expectedArtifact === undefined
            ? 'current-canonical-source'
            : 'explicit-immutable-artifact',
        currentRuntimeSourceMatches: Object.fromEntries(
          names
            .filter((name) => !name.startsWith('modules/'))
            .map((name) => [
              name,
              sha(readFileSync(new URL(`../${name}`, import.meta.url))) === sha(assets.get(name)),
            ]),
        ),
        runtimeFiles: Object.fromEntries([...assets].map(([name, bytes]) => [name, sha(bytes)])),
        verifierSha256: sha(readFileSync(new URL(import.meta.url))),
        results,
        errors,
        externalRequests: network,
      };
      writeFileSync(
        resolve(OUT, 'record-app-results.json'),
        JSON.stringify(receipt, null, 2) + '\n',
      );
      all.push(receipt);
    }
  }
} finally {
  await new Promise((done) => server.close(done));
}
assert(
  all.every((run) => run.results.length > 0),
  'No matching record app scenarios executed',
);
assert(
  all.every((run) => run.errors.length === 0 && run.externalRequests.length === 0),
  'Unexpected browser error or external request',
);
assert(
  all.every((run) => run.results.every((result) => result.status === 'passed')),
  'Record app scenario failed',
);
