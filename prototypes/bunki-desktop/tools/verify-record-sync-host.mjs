/** Actual Electron owner/preload/coordinator + actual renderer IndexedDB.
 * Authentication and the framed journal peer are explicitly synthetic. */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { _electron } from 'playwright-core';
import { stageDesktopHost } from './host-stage.cjs';
import { externalPath } from '../lib/paths.cjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { values } = parseArgs({ options: { evidence: { type: 'string' } } });
assert(values.evidence && isAbsolute(values.evidence), '--evidence requires a fresh absolute external directory');
const evidence = externalPath(values.evidence, { fresh: true });
mkdirSync(evidence, { recursive: true });
const host = join(evidence, 'host');
await stageDesktopHost({ root: repository, output: host });
const site = join(evidence, 'site'); mkdirSync(join(site, 'modules'), { recursive: true });
const fixture = resolve(repository, 'prototypes/bunki-desktop/test/fixtures/record-sync');
for (const name of ['app', 'host', 'controller', 'binding', 'sync']) writeFileSync(join(site, 'record-' + name + '.mjs'), readFileSync(resolve(repository, 'prototypes/corridor/record-' + name + '.mjs')));
const core = await build({ absWorkingDir: repository, entryPoints: ['scripts/corridor-record-entry.ts'],
  bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent' });
writeFileSync(join(site, 'modules/record-core.mjs'), core.outputFiles[0].contents);
const corridor = readFileSync(resolve(repository, 'prototypes/corridor/corridor.js'), 'utf8');
function extract(name, async = false) {
  const start = corridor.indexOf(`${async ? 'async ' : ''}function ${name}(`); assert(start >= 0);
  const end = corridor.indexOf('\n}', start); assert(end > start); return corridor.slice(start, end + 2);
}
const controls = [extract('closeRecordSync'), extract('recordSyncStatus'), extract('refreshRecordSyncSnapshot', true), extract('installRecordSync', true),
  extract('runRecordSyncAction', true), extract('updateRecordSyncSurface'), extract('renderRecordSync'), extract('refreshRecordSyncSurface')].join('\n');
writeFileSync(join(site, 'renderer.mjs'), readFileSync(join(fixture, 'renderer.mjs'), 'utf8').replace('// __ACTUAL_SYNC_CONTROLS__', controls));
writeFileSync(join(site, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Synthetic personal note sync</title><style>body{font:18px sans-serif;margin:24px}button{padding:12px;margin:4px}#visible-notes{white-space:pre-wrap}</style><script type="module" src="/renderer.mjs"></script>');
const require = createRequire(join(repository, 'prototypes/bunki-desktop/package.json'));
const executablePath = require('electron');
const env = { ...process.env, RECORD_SYNC_FIXTURE_HOST: host, RECORD_SYNC_FIXTURE_SITE: site,
  RECORD_SYNC_FIXTURE_PROFILE: join(evidence, 'profile'), RECORD_SYNC_FIXTURE_NODE: process.execPath };
delete env.ELECTRON_RUN_AS_NODE;
const checks = []; let application; const pageErrors = [];
const check = async (name, action) => { await action(); checks.push(name); };
async function currentPage() {
  const page = application.windows().at(-1) || await application.firstWindow();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.waitForFunction(() => window.fixture?.booted || window.fixture?.failed);
  assert.deepEqual(await page.evaluate(() => fixture.errors), []);
  return page;
}
async function connect(page) {
  await page.locator('#record-sync-connect').click();
  await page.waitForFunction(() => fixture.status()?.state === 'ready' || fixture.status()?.state === 'error');
  assert.equal(await page.evaluate(() => fixture.status().state), 'ready');
}
async function sync(page) {
  await page.locator('#record-sync-now').click();
  await page.waitForFunction(() => fixture.status()?.state !== 'syncing');
  assert.equal(await page.evaluate(() => fixture.status().state), 'ready');
}
let receipt;
try {
  application = await _electron.launch({ executablePath, args: [join(fixture, 'electron-main.cjs')], cwd: evidence, env, timeout: 30000 });
  application.process().stdout.on('data', (bytes) => appendFileSync(join(evidence, 'electron.log'), bytes));
  application.process().stderr.on('data', (bytes) => appendFileSync(join(evidence, 'electron.log'), bytes));
  let page = await currentPage();
  await check('real preload registers after renderer record activation without automatic grant', async () => {
    assert.equal(await page.evaluate(() => fixture.status().state), 'disconnected');
    assert.equal((await application.evaluate(() => globalThis.__recordSyncFixture.state())).grants, 0);
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    const refused = await page.evaluate(() => window.kairoSync.connect({ registrationId: fixture.registration() }));
    assert.equal(refused.code, 'user-action-required');
  });
  await check('real note command uploads through trusted-click UI, preload, coordinator and framed native session', async () => {
    const created = await page.evaluate(() => fixture.createNote('Synthetic note from desktop A'));
    assert.equal(created.status, 'active');
    assert.equal(await page.evaluate(async () => (await fixture.snapshot()).outbox.length), 1);
    await connect(page); await sync(page);
    assert.equal(await page.evaluate(async () => (await fixture.snapshot()).outbox.length), 0);
    assert.equal((await application.evaluate(() => globalThis.__recordSyncFixture.state())).journalCount, 1);
  });
  await check('second isolated device receives and publishes note without copying learner documents', async () => {
    await application.evaluate(() => globalThis.__recordSyncFixture.open('b')); page = await currentPage();
    await connect(page); await sync(page);
    assert.match(await page.locator('#visible-notes').innerText(), /Synthetic note from desktop A/u);
    assert.equal(await page.evaluate(async () => (await fixture.snapshot()).documents.find((row) => row.collection === 'learner-record').value.localOnly), 'SYNTHETIC-LOCAL-DOCUMENT-b');
    assert.equal((await page.evaluate(() => fixture.createNote('Synthetic note from desktop B'))).status, 'active');
    await sync(page);
  });
  await check('first device reopens its durable store and receives the second device note', async () => {
    await application.evaluate(() => globalThis.__recordSyncFixture.open('a')); page = await currentPage();
    assert.match(await page.locator('#visible-notes').innerText(), /Synthetic note from desktop A/u);
    await connect(page); await sync(page);
    assert.match(await page.locator('#visible-notes').innerText(), /Synthetic note from desktop B/u);
    assert.equal(await page.evaluate(async () => (await fixture.snapshot()).documents.find((row) => row.collection === 'learner-record').value.localOnly), 'SYNTHETIC-LOCAL-DOCUMENT-a');
  });
  await check('native lease revocation interrupts an actual pending framed cycle without success', async () => {
    const before = await application.evaluate(() => globalThis.__recordSyncFixture.state().requests);
    await application.evaluate(() => globalThis.__recordSyncFixture.hold());
    await page.locator('#record-sync-now').click();
    await application.evaluate(async (before) => {
      while (globalThis.__recordSyncFixture.state().requests === before) await new Promise((done) => setTimeout(done, 10));
      globalThis.__recordSyncFixture.revoke();
    }, before);
    await page.waitForFunction(() => fixture.status()?.state === 'error');
    assert.doesNotMatch(await page.locator('.record-sync-status').innerText(), /finished/u);
    assert.match(await page.locator('#visible-notes').innerText(), /Synthetic note from desktop B/u);
  });
  await check('reload closes old endpoint and reopens persisted notes without automatic reconnection', async () => {
    const grants = (await application.evaluate(() => globalThis.__recordSyncFixture.state())).grants;
    await page.reload(); await page.waitForFunction(() => window.fixture?.booted || window.fixture?.failed);
    assert.deepEqual(await page.evaluate(() => fixture.errors), []);
    assert.equal(await page.evaluate(() => fixture.status().state), 'disconnected');
    assert.equal((await application.evaluate(() => globalThis.__recordSyncFixture.state())).grants, grants);
    assert.match(await page.locator('#visible-notes').innerText(), /Synthetic note from desktop B/u);
  });
  assert.deepEqual(pageErrors, []);
  receipt = { pass: true, checks, runtime: await application.evaluate(() => ({ electron: process.versions.electron, processId: process.pid })),
    native: await application.evaluate(() => globalThis.__recordSyncFixture.state()) };
} catch (error) { receipt = { pass: false, checks, error: { message: error.message, stack: error.stack }, pageErrors }; }
finally {
  await application?.evaluate(() => globalThis.__recordSyncFixture?.close()).catch(() => {});
  await application?.close().catch(() => {});
  receipt = { ...receipt, completedAt: new Date().toISOString(), host, site,
    scope: 'Actual Electron sandbox/preload/main owner/coordinator and real renderer controller/IndexedDB; actual Corridor sync-control functions; synthetic bootstrap and framed journal peer only. No live CloudKit or full Corridor boot claim.' };
  writeFileSync(join(evidence, 'verification.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
  process.exitCode = receipt.pass ? 0 : 1;
}
