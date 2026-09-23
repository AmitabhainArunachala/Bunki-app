/** Full rendered import/export with native operation history. Fixtures assume
 * an already-admitted synthetic learner scope; they do not authenticate devices. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { createAppBackupFixture, restoreAppFixture } from './record-fixture-support.mjs';
import { armRecordWriteFailure, clearRecordWriteFailure, readAppRecordSnapshot } from './record-test-support.mjs';

const SITE = resolveCorridorSite();
const OUT = resolveCorridorEvidence();
const ENGINES = process.env.KAIRO_BROWSER === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER || 'chromium'];
assert(ENGINES.every((engine) => ['chromium', 'webkit'].includes(engine)));
const FILTER = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
const manifest = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8'));
const verifierSha256 = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
const browserVersions = {};
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  try {
    if (!file.startsWith(`${SITE}/`) || !statSync(file).isFile()) throw new Error('missing');
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
/** An import canonicalizes absent draft roots to empty collections (the
 * 'known empty-draft canonicalization' the practice and tutor suites declare);
 * expectations captured before an import compare through the same rule. */
const withCanonicalDrafts = (record) => ({ ...record,
  teacherDrafts: record.teacherDrafts ?? { version: 1, entries: [] },
  sentenceDrafts: record.sentenceDrafts ?? { version: 1, entries: [] } });

const errors = [];
const externalRequests = [];
const startedAt = new Date().toISOString();
const archive = [{ id: 'synthetic-backup-turn', surface: 'chat', role: 'user', content: 'Synthetic retained original note.', ts: 1700000000010 }];
const normalize = (v) => Array.isArray(v) ? v.map(normalize) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, normalize(v[key])])) : v;
const digest = (v) => createHash('sha256').update(JSON.stringify(normalize(v))).digest('hex');

async function exact(page, action, value) {
  return JSON.parse(await page.evaluate(async ({ source, input }) => {
    const run = (0, eval)(`(${source})`);
    return JSON.stringify(await run(JSON.parse(input)));
  }, { source: String(action), input: JSON.stringify(value ?? null) }));
}
async function journals(page) {
  return exact(page, async () => {
    const core = await import('./modules/record-core.mjs');
    const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
    const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const store = await core.IndexedDbReplicationStore.open({ databaseName: `synthetic-backup-source:${crypto.randomUUID()}`,
      policy, actor: { deviceId: 'synthetic-source-phone', incarnationId: crypto.randomUUID() } });
    const note = (id, text) => ({ kind: 'note.version', noteId: id, versionId: `${id}-v1`, generation: null,
      supersedes: [], segments: [{ kind: 'original', text }] });
    try {
      const write = async (changeId, payload) => store.commitLocal({ changeId, binding: policy.binding,
        expectedRevision: (await store.snapshot()).revision, occurredAt: '2026-09-10T01:00:00.000Z',
        mutations: [], operations: [{ payload, dependencies: [] }] });
      await write('first', note('deleted-note', 'Original note preserved in old backup.'));
      const old = core.exportOperationJournal((await store.snapshot()).replica);
      await write('delete', { kind: 'entity.tombstone', target: { kind: 'note', id: 'deleted-note' }, reason: 'user-deleted' });
      await write('unrelated', note('retained-note', 'Unrelated offline work remains.'));
      return { old, latest: core.exportOperationJournal((await store.snapshot()).replica) };
    } finally { await store.close(); }
  });
}
async function nativeReplica(page) {
  return exact(page, async () => {
    const core = await import('./modules/record-core.mjs');
    const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
    const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, policy, actor: installation.actor });
    try { return await store.snapshot(); } finally { await store.close(); }
  });
}
async function tray(page) {
  if (!await page.locator('#import-file').count()) await page.locator('#tray').click();
}
async function submit(page, backup) {
  await tray(page);
  await page.locator('#import-file').setInputFiles({ name: 'synthetic-full-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
}
async function failedImport(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('.airead-note')]
    .some((node) => node.getClientRects().length > 0 && /Import could not finish/u.test(node.textContent)));
}
async function exported(page, directory) {
  await tray(page);
  const wait = page.waitForEvent('download');
  await page.locator('#export-store').click();
  const download = await wait;
  const path = resolve(directory, `synthetic-export-${randomUUID()}.json`);
  await download.saveAs(path);
  return JSON.parse(readFileSync(path, 'utf8'));
}

try {
  for (const engine of ENGINES) {
    const browser = await ({ chromium, webkit }[engine]).launch();
    browserVersions[engine] = browser.version();
    const directory = resolve(OUT, engine); mkdirSync(directory, { recursive: true });
    const test = async (name, body) => {
      if (FILTER && FILTER !== name) return;
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        externalRequests.push({ engine, origin: url.origin }); return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push({ engine, message: error.message }));
      const began = Date.now();
      try {
        await page.goto(`${origin}/index.html?entry=shelf&ui=bi`);
        await page.waitForFunction(() => document.body.dataset.ready === '1');
        await body({ page, directory });
        results.push({ engine, name, pass: true, elapsedMs: Date.now() - began });
      } catch (error) {
        results.push({ engine, name, pass: false, error: String(error.stack || error), elapsedMs: Date.now() - began });
        await page.screenshot({ path: resolve(directory, `${name}-failure.png`) }).catch(() => {});
      } finally { await context.close(); }
      console.log(`${engine} ${name}: ${results.at(-1).pass ? 'PASS' : 'FAIL'}`);
    };
    try {
      await test('full-ui-backup-retains-operation-bytes-record-and-archive', async ({ page, directory }) => {
        const initial = await readAppRecordSnapshot(page);
        const { old } = await journals(page);
        const record = { ...initial.record, futureBackupRoot: { retained: 'synthetic original root' } };
        await restoreAppFixture(page, record, { archive, journal: old });
        const native = await nativeReplica(page);
        assert.deepEqual(native.replica.operations, old.operations);
        assert.deepEqual(native.outbox, old.operations);
        assert.equal(native.actor.sequence, 0, 'Restore must not allocate a new local event');
        const file = await exported(page, directory);
        assert.equal(file.version, 2);
        assert.deepEqual(file.record, withCanonicalDrafts(record));
        assert.deepEqual(file.archive.turns, archive);
        assert.deepEqual(file.journal, old);
        assert.equal(file.counts.syncOperations, 1);
        assert.deepEqual(file.sha256, { record: digest(withCanonicalDrafts(record)), archive: digest(file.archive), journal: digest(old) });
        assert.deepEqual((await readAppRecordSnapshot(page)).installation, initial.installation);
      });
      await test('old-ui-backup-preserves-current-tombstone-and-unrelated-work', async ({ page }) => {
        const initial = await readAppRecordSnapshot(page);
        const { old, latest } = await journals(page);
        await restoreAppFixture(page, initial.record, { journal: latest });
        const before = await nativeReplica(page);
        await restoreAppFixture(page, initial.record, { journal: old });
        const after = await nativeReplica(page);
        assert.deepEqual(after.replica, before.replica);
        assert.deepEqual(after.outbox, before.outbox);
        assert.deepEqual(after.actor, before.actor);
        assert.deepEqual(after.replica.projection.entities.find((row) => row.target.id === 'deleted-note').heads, []);
        assert.equal(after.replica.projection.entities.find((row) => row.target.id === 'retained-note').heads.length, 1);
        assert.equal(after.replica.projection.scheduling, 'not-computed');
        assert.equal(after.replica.operations.length, 3);
      });
      await test('archive-api-replacement-preserves-operation-journal', async ({ page, directory }) => {
        const initial = await readAppRecordSnapshot(page);
        const { old } = await journals(page);
        await restoreAppFixture(page, initial.record, { archive, journal: old });
        const before = await nativeReplica(page);
        assert.equal(await page.evaluate(() => window.__KAIRO_AI__.__clear()), true);
        const after = await nativeReplica(page);
        assert.deepEqual(after.replica, before.replica);
        assert.deepEqual(after.outbox, before.outbox);
        assert.deepEqual(after.actor, before.actor);
        assert.deepEqual((await readAppRecordSnapshot(page)).archive.turns, []);
        const file = await exported(page, directory);
        assert.deepEqual(file.journal, old);
        assert.equal(file.counts.syncOperations, 1);
        assert.equal(file.counts.archiveTurns, 0);
      });
      for (const kind of ['foreign-scope', 'corrupt-operation']) await test(`${kind}-ui-backup-rejected-without-any-record-change`, async ({ page }) => {
        const initial = await readAppRecordSnapshot(page);
        const { old } = await journals(page);
        if (kind === 'foreign-scope') old.scope.accountId = 'another-synthetic-account';
        else old.operations[0].payload.segments[0].text = 'Changed without a valid operation digest';
        const { sha256: ignored, ...body } = old;
        assert.equal(typeof ignored, 'string');
        old.sha256 = digest(body);
        await tray(page);
        const before = await readAppRecordSnapshot(page);
        await submit(page, createAppBackupFixture(initial.record, archive, old));
        await failedImport(page);
        assert.deepEqual(await readAppRecordSnapshot(page), before);
      });
      for (const mode of ['quota', 'abort']) await test(`${mode}-ui-restore-rolls-back-documents-journal-and-outbox-together`, async ({ page }) => {
        const initial = await readAppRecordSnapshot(page);
        const { old } = await journals(page);
        const record = { ...initial.record, futureBackupRoot: { committedTogether: true } };
        await tray(page);
        const before = await readAppRecordSnapshot(page);
        await armRecordWriteFailure(page, mode);
        await submit(page, createAppBackupFixture(record, archive, old));
        await failedImport(page);
        assert.equal((await clearRecordWriteFailure(page)).fired, 1);
        assert.deepEqual(await readAppRecordSnapshot(page), before);
        await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === '1');
        assert.deepEqual((await readAppRecordSnapshot(page)).rows, before.rows);
        await restoreAppFixture(page, record, { archive, journal: old });
        const after = await nativeReplica(page);
        assert.deepEqual(after.replica.operations, old.operations);
        assert.deepEqual(after.outbox, old.operations);
        assert.equal(after.actor.sequence, 0);
      });
    } finally { await browser.close(); }
  }
} finally {
  await new Promise((done) => server.close(done));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'receipt.json'), JSON.stringify({ suite: 'record-sync-backup', version: 1,
    artifactSha256: manifest.artifactSha256, verifierSha256, engines: ENGINES, browserVersions, startedAt, completedAt: new Date().toISOString(),
    results, errors, externalRequests, pass: results.length > 0 && results.every((row) => row.pass) && !errors.length && !externalRequests.length,
    limitations: ['Synthetic same-learner admission only; no account authentication or real cross-device transport.',
      'Received notes are not yet rendered as app notes; this checks complete backup and durable merge state.'] }, null, 2));
}
assert(results.length > 0 && results.every((row) => row.pass), 'Record sync backup cases failed');
assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
