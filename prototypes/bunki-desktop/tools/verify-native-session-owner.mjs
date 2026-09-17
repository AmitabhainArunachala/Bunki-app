import assert from 'node:assert/strict';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, isAbsolute, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '../test/fixtures/native-session-owner');
const { values } = parseArgs({ options: { repository: { type: 'string' }, host: { type: 'string' }, evidence: { type: 'string' } } });
for (const name of ['repository', 'host', 'evidence']) assert(typeof values[name] === 'string' && isAbsolute(values[name]), '--' + name + ' requires an explicit absolute path');
const repository = realpathSync(values.repository);
const host = realpathSync(values.host);
const require = createRequire(join(repository, 'package.json'));
const { _electron } = require('playwright-core');
const { externalPath } = require(join(host, 'lib/paths.cjs'));
const evidence = externalPath(values.evidence, { fresh: true });
mkdirSync(evidence, { recursive: true });
const executablePath = createRequire(join(repository, 'prototypes/bunki-desktop/package.json'))('electron');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const paths = [fileURLToPath(import.meta.url), join(FIXTURES, 'electron-owner.cjs'), join(FIXTURES, 'stdio-child.cjs'),
  ...['native-session-owner', 'native-rpc-session', 'native-rpc-byte-port', 'navigation-policy', 'paths'].map((name) => join(host, 'lib/' + name + '.cjs'))];
mkdirSync(join(evidence, 'frozen-inputs'));
const inputs = paths.map((path, index) => {
  const bytes = readFileSync(path); const snapshot = join(evidence, 'frozen-inputs', String(index).padStart(2, '0') + '-' + path.split('/').at(-1)); writeFileSync(snapshot, bytes);
  return { path, bytes: bytes.length, sha256: sha(bytes), snapshot };
});
const caseNames = [
  'dormant-ticket-and-valid-framed-session', 'unspawned-child-is-refused-without-native-adoption',
  'already-closed-child-teardown-removes-terminal-listeners',
  ...['reload', 'loadURL', 'history-back', 'crash', 'destroy', 'close', 'profile', 'logout', 'native-signal', 'eof', 'native-event'].map((mode) => 'pending-request-revoked-' + mode),
  'same-document-and-subframe-controls-preserve-session', 'late-bootstrap-cannot-kill-current-replacement',
  'duplicate-child-and-consumed-ticket-cannot-rebind', 'native-teardown-cannot-reenter-document-admission',
  'closed-owner-disposes-late-bootstrap-result', 'synchronous-port-close-during-construction-tears-down-once',
  'actual-app-before-quit-revokes-dormant-and-active-owner',
];
const startedAt = new Date().toISOString();
let application;
let receipt;
try {
  const env = { ...process.env, OWNER_FIXTURE_HOST: host, OWNER_FIXTURE_PROFILE: join(evidence, 'profile'), OWNER_FIXTURE_NODE: process.execPath };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.OWNER_FIXTURE_CASE;
  application = await _electron.launch({ executablePath, args: [join(FIXTURES, 'electron-owner.cjs')], cwd: evidence, env, timeout: 30000 });
  application.process().stdout.on('data', (bytes) => appendFileSync(join(evidence, 'electron.log'), bytes));
  application.process().stderr.on('data', (bytes) => appendFileSync(join(evidence, 'electron.log'), bytes));
  await application.firstWindow();
  await application.evaluate(async () => { while (!globalThis.__nativeOwnerFixture) await new Promise((done) => globalThis.setTimeout(done, 10)); });
  receipt = await application.evaluate(() => globalThis.__nativeOwnerFixture.run());
  assert.equal(receipt.processId, application.process().pid);
  assert.equal(receipt.electron, createRequire(join(repository, 'prototypes/bunki-desktop/package.json'))('electron/package.json').version);
  assert.deepEqual(receipt.results.map((row) => row.name), caseNames);
  assert.equal(receipt.syntheticNativeAuthorization, true);
  assert.equal(receipt.productionPairing, false);
  assert(receipt.results.every((row) => row.ownerListenersRemoved && row.children.every((child) => child.closed && child.listeners.stdoutData === 0 && child.listeners.stderrData === 0)), 'Owned resources survived teardown');
} catch (error) {
  receipt = { ...receipt, pass: false, fatal: { message: error.message, stack: error.stack } };
} finally {
  if (receipt) writeFileSync(join(evidence, 'receipt-before-cleanup.json'), JSON.stringify(receipt, null, 2) + '\n');
  if (application) {
    await application.evaluate(() => globalThis.__nativeOwnerFixture?.allowQuit()).catch(() => {});
    await application.close().catch((error) => { receipt = { ...receipt, pass: false, cleanupError: error.message }; });
  }
  for (const input of inputs) {
    if (sha(readFileSync(input.path)) !== input.sha256) receipt = { ...receipt, pass: false, identityError: 'A verified input changed during execution' };
  }
  receipt = { ...receipt, version: 1, suite: 'native-session-owner-actual-electron', mode: 'full', startedAt, completedAt: new Date().toISOString(),
    repository, host, executablePath, runtimeOverridden: false, nativeAuthorizationProvidedByFixture: true, productionPairing: false, inputs, caseNames };
  writeFileSync(join(evidence, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ pass: receipt.pass, results: receipt.results?.map((row) => ({ name: row.name, pass: row.pass, error: row.error?.message, teardownError: row.teardownError })), fatal: receipt.fatal }, null, 2));
  process.exitCode = receipt.pass ? 0 : 1;
}
