'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');
const { launchNativeCloudSync, readNativeCloudConfiguration } = require('../lib/native-cloud-sync.cjs');

const parent = path.join(os.homedir(), '.dharma', 'bunki', 'native-control-tests');
fs.mkdirSync(parent, { recursive: true });
const evidence = fs.mkdtempSync(path.join(parent, 'run-'));
const binding = { accountId: 'synthetic-account', learnerId: 'synthetic-learner', sessionId: 'synthetic-session' };
const fixtureSource = (mode) => `#!${process.execPath}
'use strict';
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const stream = fs.createReadStream(null, { fd: 3 });
let buffer = Buffer.alloc(0);
let received = false;
function send(value, fd = 4) { const body = Buffer.from(JSON.stringify(value)); const size = Buffer.alloc(4); size.writeUInt32BE(body.length); fs.writeSync(fd, Buffer.concat([size, body])); }
stream.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  if (received || buffer.length < 4 || buffer.length < buffer.readUInt32BE(0) + 4) return;
  received = true;
  const request = JSON.parse(buffer.subarray(4, buffer.readUInt32BE(0) + 4));
  fs.writeFileSync(__filename + '.received.json', JSON.stringify({ pid: process.pid, received: true }));
  const base = { format: request.format, v: request.v, requestId: request.requestId, connectionId: request.connectionId };
  const ready = { ...base, type: 'ready', binding: request.binding, channelId: 'ck-private-v1:' + 'a'.repeat(64), leaseId: randomUUID() };
  const mode = ${JSON.stringify(mode)};
  if (mode === 'refuse') send({ ...base, type: 'error', code: 'configuration-unavailable' });
  else if (mode.startsWith('error-')) send({ ...base, type: 'error', code: mode.slice(6) });
  else if (mode === 'wrong-binding') send({ ...ready, binding: { ...request.binding, learnerId: 'foreign' } });
  else if (mode === 'wrong-connection') send({ ...ready, connectionId: randomUUID() });
  else if (mode === 'stdout-only') send(ready, 1);
  else if (mode === 'oversize') { const header = Buffer.alloc(4); header.writeUInt32BE(16385); fs.writeSync(4, header); }
  else if (mode === 'ready') send(ready);
  else if (mode === 'revoke') { send(ready); setTimeout(() => send({ ...base, type: 'revoked', code: 'account-changed' }), 50); }
});
stream.on('end', () => process.exit(0));
stream.on('error', () => process.exit(0));
`;
function configuration(mode) {
  const directory = path.join(evidence, mode, 'native');
  fs.mkdirSync(directory, { recursive: true });
  const executable = path.join(directory, 'kairo-cloud-sync-host');
  fs.writeFileSync(executable, fixtureSource(mode), { mode: 0o700 });
  fs.writeFileSync(path.join(directory, 'cloud-sync-config.json'), JSON.stringify({ version: 1,
    containerIdentifier: 'iCloud.example.synthetic', keychainService: 'example.synthetic', profileLabel: 'Synthetic test learner' }));
  return readNativeCloudConfiguration(path.dirname(directory));
}

test('missing native configuration stays unavailable without spawning a process', () => {
  assert.equal(readNativeCloudConfiguration(evidence), null);
});

test('dedicated framed control channel attaches only the exact native child lease', async () => {
  const lease = await launchNativeCloudSync({ configuration: configuration('ready'), binding, timeoutMs: 2000 });
  assert.deepEqual(lease.binding, binding);
  assert.equal(lease.revocationSignal.aborted, false);
  const closed = once(lease.child, 'close');
  lease.revoke();
  assert.equal(lease.revocationSignal.aborted, true);
  await closed;
  assert(lease.child.exitCode !== null || lease.child.signalCode !== null);
});

for (const [mode, code] of [['refuse', 'configuration-unavailable'], ['wrong-binding', 'invalid-control'],
  ['wrong-connection', 'invalid-control'], ['oversize', 'invalid-control'], ['stdout-only', 'connection-timeout'],
  ['error-accountUnavailable', 'account-unavailable'], ['error-staleSession', 'stale-session'],
  ['error-journalReset', 'journal-reset'], ['error-unknown-provider-name', 'native-unavailable']]) {
  test('native control refuses ' + mode, async () => {
    const config = configuration(mode);
    await assert.rejects(launchNativeCloudSync({ configuration: config, binding, timeoutMs: 3000 }),
      (error) => error.code === code);
    assert.equal(JSON.parse(fs.readFileSync(config.executable + '.received.json')).received, true);
  });
}

test('native account revocation synchronously fences the returned lease', async () => {
  const lease = await launchNativeCloudSync({ configuration: configuration('revoke'), binding, timeoutMs: 2000 });
  const closed = once(lease.child, 'close');
  await new Promise((resolve) => lease.revocationSignal.addEventListener('abort', resolve, { once: true }));
  assert(lease.revocationSignal.aborted);
  await closed;
});

test('document cancellation before confirmation cannot leave a pending helper alive', async () => {
  const abort = new AbortController();
  const promise = launchNativeCloudSync({ configuration: configuration('pending'), binding, signal: abort.signal, timeoutMs: 2000 });
  abort.abort();
  await assert.rejects(promise, (error) => error.code === 'cancelled');
});
