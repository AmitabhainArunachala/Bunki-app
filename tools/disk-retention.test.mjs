import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { snapshotGate, finalizeGateFootprint } from './disk-retention.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePrefix = '.disk-retention-fixture-';
const closed = async () => ({ closed: true, source: 'pure-fixture-no-processes' });
const hash = data => createHash('sha256').update(data).digest('hex');
const passingBattery = () => ({
  kind: 'kairo-required-battery', status: 'passed', exitCode: 0,
  completedAt: '2026-10-21T00:00:00.000Z',
  gates: [{ name: 'synthetic', status: 'passed', exitCode: 0, processExitCode: 0 }],
});

async function fixture(run) {
  const stat = await fs.statfs(here);
  if (stat.bavail * stat.bsize < 1.5 * 1024 ** 3) throw new Error('STOP_LOW_DISK: less than 1.5 GiB available');
  const container = await fs.mkdtemp(path.join(here, fixturePrefix));
  const root = path.join(container, 'gate');
  await fs.mkdir(root);
  async function put(rel, value) {
    const target = path.join(root, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, typeof value === 'object' && !Buffer.isBuffer(value) ? JSON.stringify(value) : value);
  }
  async function pass(extra = []) {
    await put('battery.json', passingBattery());
    return ['battery.json', ...extra];
  }
  const exists = async rel => fs.access(path.join(root, rel)).then(() => true, () => false);
  try { return await run({ root, container, put, pass, exists }); }
  finally {
    // Only this invocation's freshly created, small fixture may be removed.
    assert.equal(path.dirname(container), here);
    assert.ok(path.basename(container).startsWith(fixturePrefix));
    await fs.rm(container, { recursive: true, force: false });
  }
}

test('snapshot is immutable, records hashes and directories, and authenticates its root', async () => fixture(async ({ root, put, container }) => {
  await put('nested/item.txt', 'materialized');
  const before = await snapshotGate(root);
  assert.deepEqual(before.files, [{ path: 'nested/item.txt', size: 12, sha256: hash('materialized') }]);
  assert.deepEqual(before.dirs, ['nested']);
  assert.deepEqual(before.links, []);
  assert.throws(() => { before.files[0].size = 0; }, TypeError);
  await assert.rejects(finalizeGateFootprint({ root: container, before, passed: false }), { code: 'inventory-root-mismatch' });
}));

test('failed attempts retain every trace and profile with an exact durable ledger', async () => fixture(async ({ root, put, exists }) => {
  const before = await snapshotGate(root);
  await put('trace.zip', 'failed trace');
  await put('profile/Default/cache.bin', 'failed profile');
  const result = await finalizeGateFootprint({ root, before, passed: false });
  assert.equal(result.status, 'retained');
  assert.equal(await exists('trace.zip'), true);
  assert.equal(await exists('profile/Default/cache.bin'), true);
  const expectedBytes = Buffer.byteLength('failed trace') + Buffer.byteLength('failed profile');
  assert.equal(result.bytesWritten, expectedBytes);
  assert.equal(result.bytesKept, expectedBytes);
  assert.equal(result.bytesRemoved, 0);
  assert.deepEqual(JSON.parse(await fs.readFile(result.ledgerPath, 'utf8')), result);
}));

test('passing cleanup follows a durable plan and preserves pass records, screenshots, console and empty logs', async () => fixture(async ({ root, put, pass, exists }) => {
  const before = await snapshotGate(root);
  await put('trace.zip', 'zip data');
  await put('nested/trace-webkit.zip', 'another trace');
  await put('profile-123/Default/cache.bin', 'cache');
  await put('browser-profile/LevelDB/000001.log', 'native LevelDB cache');
  await put('browser-profile/Icons/icon.png', 'native browser cache icon');
  await put('restored-profile/state', 'reused then closed');
  await put('pass-record.json', '{"passed":true}');
  await put('screenshot.png', 'screenshot');
  await put('console.json', '{"events":[]}');
  await put('stdout.log', '');
  await put('producer.json', '{"negativeControls":[{"status":"failed","passed":false}]}');
  await put('arbitrary-cache/keep.bin', 'unregistered');
  const evidencePaths = await pass(['pass-record.json', 'screenshot.png', 'console.json', 'stdout.log', 'producer.json']);
  let inspectedPlan;
  const result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths, closureCheck: async () => {
    const journal = (await fs.readdir(root)).find(name => name.startsWith('.gate-footprint-'));
    inspectedPlan = JSON.parse(await fs.readFile(path.join(root, journal, 'plan.json'), 'utf8'));
    assert.ok(inspectedPlan.inventory.files.some(file => file.path === 'trace.zip'));
    assert.ok(inspectedPlan.deletionPlan.files.some(file => file.path === 'trace.zip'));
    assert.equal(await exists('trace.zip'), true);
    return { closed: true, processCount: 0 };
  } });
  assert.ok(inspectedPlan);
  assert.equal(result.status, 'cleaned');
  for (const rel of ['trace.zip', 'nested/trace-webkit.zip', 'profile-123', 'browser-profile', 'restored-profile']) assert.equal(await exists(rel), false, rel);
  for (const rel of [...evidencePaths, 'arbitrary-cache/keep.bin']) assert.equal(await exists(rel), true, rel);
  assert.ok(result.bytesRemoved > 0);
  assert.equal(result.bytesBeforeCleanup - result.bytesKept, result.bytesRemoved);
  assert.equal(result.bytesRemoved, result.confirmedRemovedBytes);
  for (const item of result.evidence) assert.deepEqual(item.before, item.after);
  const final = await snapshotGate(root);
  assert.equal(final.files.reduce((total, file) => total + file.size, 0), result.totalBytesKept);
  assert.equal(result.totalBytesKept, result.bytesKept + result.journalOverheadBytes);
}));

test('an earlier failed attempt remains intact when a later attempt passes', async () => fixture(async ({ root, put, pass, exists }) => {
  await put('earlier/trace.zip', 'old failed trace');
  await put('earlier/profile/cache', 'old failed profile');
  await put('profile/cache', 'old baseline profile');
  await put('trace.zip', 'old baseline trace');
  const before = await snapshotGate(root);
  await put('trace.zip', 'changed but preexisting trace');
  await put('profile/new-cache', 'new content in old profile');
  await put('later/trace.zip', 'passing trace');
  const result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths: await pass(), closureCheck: closed });
  assert.equal(result.status, 'cleaned');
  for (const rel of ['earlier/trace.zip', 'earlier/profile/cache', 'profile/cache', 'profile/new-cache', 'trace.zip']) assert.equal(await exists(rel), true, rel);
  assert.equal(await exists('later/trace.zip'), false);
  assert.ok(result.keptCandidates.some(item => item.reason === 'preexisting-profile'));
  assert.ok(result.keptCandidates.some(item => item.reason === 'preexisting-trace'));
}));

test('successful expected-negative cases clean new scratch paths despite failure or blocked names', async () => fixture(async ({ root, put, pass, exists }) => {
  const before = await snapshotGate(root);
  await put('failed-attempt/trace.zip', 'failure');
  await put('interrupted/profile/cache', 'interruption');
  await put('trace-failed.zip', 'failure');
  await put('blocked-case/profile/cache', 'expected negative case');
  const result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths: await pass(), closureCheck: closed });
  assert.equal(result.status, 'cleaned');
  for (const rel of ['failed-attempt/trace.zip', 'interrupted/profile', 'trace-failed.zip', 'blocked-case/profile']) assert.equal(await exists(rel), false, rel);
  assert.equal(result.bytesRemoved, Buffer.byteLength('failure') * 2 + Buffer.byteLength('interruption') + Buffer.byteLength('expected negative case'));
}));

test('pending native battery receipts block cleanup even with passed=true', async () => fixture(async ({ root, put, exists }) => {
  const before = await snapshotGate(root);
  await put('trace.zip', 'keep');
  await put('profile/cache', 'keep');
  await put('battery.json', { ...passingBattery(), status: 'running', completedAt: null });
  const result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths: ['battery.json'], closureCheck: () => { throw new Error('must not be called'); } });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'final-battery-receipt-not-passed');
  assert.equal(await exists('trace.zip'), true);
  assert.equal(await exists('profile/cache'), true);
  assert.equal(result.bytesRemoved, 0);
}));

test('missing receipt or missing evidence cannot authorize cleanup', async () => {
  for (const evidencePaths of [[], ['screenshot.png'], ['missing.json']]) await fixture(async ({ root, put, exists }) => {
    const before = await snapshotGate(root);
    await put('trace.zip', 'keep');
    await put('screenshot.png', 'image');
    const result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths, closureCheck: closed });
    assert.equal(result.status, 'blocked');
    assert.equal(await exists('trace.zip'), true);
    assert.equal(result.bytesRemoved, 0);
  });
});

test('not-closed and interrupted closure retain all files and the write-ahead plan', async () => {
  for (const closureCheck of [async () => ({ closed: false, pending: ['fixture-pid'] }), async () => { throw new Error('interrupted'); }, undefined]) {
    await fixture(async ({ root, put, pass, exists }) => {
      const before = await snapshotGate(root);
      await put('trace.zip', 'keep');
      await put('legacy-browser-profile/cache', 'keep');
      const result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths: await pass(), closureCheck });
      assert.equal(result.status, 'blocked');
      assert.equal(await exists('trace.zip'), true);
      assert.equal(await exists('legacy-browser-profile/cache'), true);
      assert.equal(result.bytesRemoved, 0);
      assert.ok((await fs.stat(result.inventoryPath)).size > 0);
    });
  }
});

test('explicit evidence within a profile protects the entire profile, including nested traces', async () => fixture(async ({ root, put, pass, exists }) => {
  const before = await snapshotGate(root);
  await put('profile/screenshot.png', 'pinned screenshot');
  await put('profile/console.log', 'pinned console');
  await put('profile/cache', 'cache');
  await put('profile/trace.zip', 'profile trace');
  await put('profile-record/pass-record.json', '{"passed":true}');
  await put('profile-record/cache', 'cache');
  const result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths: await pass(['profile/screenshot.png', 'profile/console.log']), closureCheck: closed });
  assert.equal(result.status, 'cleaned');
  for (const rel of ['profile/screenshot.png', 'profile/console.log', 'profile/cache', 'profile/trace.zip', 'profile-record/pass-record.json', 'profile-record/cache']) assert.equal(await exists(rel), true, rel);
  assert.equal(result.bytesRemoved, 0);
  assert.equal(result.keptCandidates.filter(item => item.reason === 'protected-evidence-in-profile').length, 2);
}));

test('symlink escape is never followed and introduced links produce a blocked ledger', async () => fixture(async ({ root, container, put, pass, exists }) => {
  const before = await snapshotGate(root);
  const outside = path.join(container, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'trace.zip'), 'outside sentinel');
  await put('trace.zip', 'inside trace');
  await put('profile/cache', 'cache');
  await fs.symlink(outside, path.join(root, 'profile', 'escape'));
  await assert.rejects(snapshotGate(root), { code: 'symlink-refused' });
  const result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths: await pass(), closureCheck: closed });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'symlink-refused');
  assert.equal(result.symlinks[0].path, 'profile/escape');
  assert.equal(await exists('trace.zip'), true);
  assert.equal(await fs.readFile(path.join(outside, 'trace.zip'), 'utf8'), 'outside sentinel');
  assert.ok((await fs.stat(result.ledgerPath)).isFile());
}));

test('forged inventory and traversal evidence paths cannot select deletion targets', async () => fixture(async ({ root, put, pass, exists }) => {
  await put('trace.zip', 'preexisting');
  const before = await snapshotGate(root);
  const fake = JSON.parse(JSON.stringify(before));
  fake.files = [];
  fake.dirs = [];
  await assert.rejects(finalizeGateFootprint({ root, before: fake, passed: true, evidencePaths: await pass(), closureCheck: closed }), { code: 'unauthenticated-inventory' });
  const result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths: ['../outside'], closureCheck: closed });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'unsafe-relative-path');
  assert.equal(await exists('trace.zip'), true);
}));

test('failed profiles containing native symlinks and a socket are retained without following either', async () => fixture(async ({ root, put, exists }) => {
  const before = await snapshotGate(root);
  await put('profile/cache', 'failed profile');
  await fs.symlink('unavailable-native-owner', path.join(root, 'profile/SingletonLock'));
  const socketPath = path.join(root, 'profile/SingletonSocket');
  // Classify an owned fixture file as a socket to exercise non-regular-file
  // preservation without opening a socket, process, or any external path.
  const originalLstat = fs.lstat;
  await put('profile/SingletonSocket', 'synthetic socket entry');
  fs.lstat = async (target, ...args) => {
    const stat = await originalLstat(target, ...args);
    if (target === socketPath) {
      stat.isFile = () => false;
      stat.isSocket = () => true;
    }
    return stat;
  };
  let result;
  try { result = await finalizeGateFootprint({ root, before, passed: false }); }
  finally { fs.lstat = originalLstat; }
  assert.equal(result.status, 'retained');
  assert.equal(await exists('profile/cache'), true);
  assert.equal((await fs.lstat(path.join(root, 'profile/SingletonLock'))).isSymbolicLink(), true);
  assert.deepEqual(result.unmeasuredPaths, [{ path: 'profile/SingletonSocket', type: 'socket', logicalBytes: null }]);
  assert.equal(result.bytesRemoved, 0);
}));

test('a planned file changed between plan and apply blocks every deletion', async () => fixture(async ({ root, put, pass, exists }) => {
  const before = await snapshotGate(root);
  await put('trace.zip', 'original trace');
  await put('profile/cache', 'unchanged cache');
  const result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths: await pass(), closureCheck: async () => {
    await put('trace.zip', 'changed after durable deletion plan');
    return { closed: true };
  } });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'gate-content-changed-before-cleanup');
  assert.equal(await exists('trace.zip'), true);
  assert.equal(await exists('profile/cache'), true);
  assert.equal(result.bytesRemoved, 0);
  assert.deepEqual(result.removedFiles, []);
}));

test('evidence changed during closure is recorded with unequal hashes and no cleanup', async () => fixture(async ({ root, put, pass, exists }) => {
  const before = await snapshotGate(root);
  await put('trace.zip', 'keep');
  const result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths: await pass(), closureCheck: async () => {
    await put('battery.json', { ...passingBattery(), status: 'blocked' });
    return { closed: true };
  } });
  assert.equal(result.status, 'blocked');
  assert.equal(await exists('trace.zip'), true);
  assert.notEqual(result.evidence[0].before.sha256, result.evidence[0].after.sha256);
}));

test('deletion error preserves a partial journal and reports only actual removed bytes', async () => fixture(async ({ root, put, pass, exists }) => {
  const before = await snapshotGate(root);
  await put('trace-a.zip', 'removed');
  await put('trace-b.zip', 'retained after error');
  await put('trace-c.zip', 'not attempted');
  const evidencePaths = await pass();
  const originalUnlink = fs.unlink;
  fs.unlink = async target => {
    if (target === path.join(root, 'trace-b.zip')) throw Object.assign(new Error('synthetic unlink failure'), { code: 'EIO' });
    return originalUnlink(target);
  };
  let result;
  try { result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths, closureCheck: closed }); }
  finally { fs.unlink = originalUnlink; }
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'EIO');
  assert.equal(await exists('trace-a.zip'), false);
  assert.equal(await exists('trace-b.zip'), true);
  assert.equal(await exists('trace-c.zip'), true);
  assert.equal(result.bytesRemoved, Buffer.byteLength('removed'));
  assert.equal(result.bytesBeforeCleanup - result.bytesKept, result.bytesRemoved);
  const operations = (await fs.readFile(result.operationsPath, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(operations.some(item => item.action === 'before-unlink' && item.path === 'trace-b.zip'));
  assert.ok(operations.some(item => item.action === 'unlinked' && item.path === 'trace-a.zip'));
  assert.ok(operations.some(item => item.action === 'blocked' && item.reason === 'EIO'));
}));

test('equal-size corruption of an unpinned retained screenshot blocks the final ledger', async () => fixture(async ({ root, put, pass }) => {
  const before = await snapshotGate(root);
  await put('trace.zip', 'disposable trace');
  await put('screenshot.png', 'original');
  const evidencePaths = await pass();
  const originalUnlink = fs.unlink;
  fs.unlink = async target => {
    const value = await originalUnlink(target);
    if (target === path.join(root, 'trace.zip')) await put('screenshot.png', 'tampered');
    return value;
  };
  let result;
  try { result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths, closureCheck: closed }); }
  finally { fs.unlink = originalUnlink; }
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'retained-payload-changed');
  assert.equal(result.payloadIntegrity.verified, false);
  assert.deepEqual(result.payloadIntegrity.mismatches.map(item => item.path), ['screenshot.png']);
  assert.equal(result.bytesRemoved, Buffer.byteLength('disposable trace'));
}));

test('accepted assessment receipts register exact sibling mkdtemp profiles only', async () => fixture(async ({ root, put, pass, exists }) => {
  const before = await snapshotGate(root);
  await put('assessment/assessment-app.json', { format: 'kairo-assessment-instrumented-app-verification', results: [{ engine: 'chromium', name: 'happy-case' }, { engine: 'webkit', name: '../escape' }] });
  await put('assessment/assessment-standalone.json', { format: 'kairo-assessment-standalone-verification', results: [{ engine: 'webkit', variant: 'synthetic' }] });
  await put('written/written-section-results.json', { format: 'kairo-public-written-section-walk', results: [{ engine: 'webkit', name: 'section-one' }] });
  const removable = ['assessment/chromium-happy-case-a1B2c3', 'assessment/webkit-synthetic-XyZ123', 'written/webkit-section-one-Ab12Cd'];
  const retained = ['assessment/chromium-happy-case-short', 'assessment/chromium-happy-case-a1B2c3-extra', 'assessment/chromium-unregistered-a1B2c3', 'assessment/nested/chromium-happy-case-a1B2c3', 'other/chromium-happy-case-a1B2c3'];
  for (const dir of [...removable, ...retained]) await put(`${dir}/cache`, dir);
  const result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths: await pass(['assessment/assessment-app.json', 'assessment/assessment-standalone.json', 'written/written-section-results.json']), closureCheck: closed });
  assert.equal(result.status, 'cleaned');
  for (const dir of removable) assert.equal(await exists(dir), false, dir);
  for (const dir of retained) assert.equal(await exists(dir), true, dir);
  const plan = JSON.parse(await fs.readFile(result.inventoryPath, 'utf8'));
  assert.equal(plan.deletionPlan.registeredProfiles.length, 3);
  for (const row of plan.deletionPlan.registeredProfiles) assert.match(row.receiptSha256, /^[a-f0-9]{64}$/);
}));

test('unaccepted or wrong-format producer receipts do not register engine directories', async () => fixture(async ({ root, put, pass, exists }) => {
  const before = await snapshotGate(root);
  await put('assessment-app.json', { format: 'kairo-assessment-instrumented-app-verification', results: [{ engine: 'chromium', name: 'unaccepted' }] });
  await put('assessment-standalone.json', { format: 'unrecognized', results: [{ engine: 'webkit', variant: 'public' }] });
  await put('chromium-unaccepted-Ab12Cd/cache', 'keep');
  await put('webkit-public-Ab12Cd/cache', 'keep');
  const result = await finalizeGateFootprint({ root, before, passed: true, evidencePaths: await pass(['assessment-standalone.json']), closureCheck: closed });
  assert.equal(result.status, 'cleaned');
  assert.equal(await exists('chromium-unaccepted-Ab12Cd'), true);
  assert.equal(await exists('webkit-public-Ab12Cd'), true);
  assert.equal(result.bytesRemoved, 0);
}));

test('delete-failed-trace mutant is killed by the failed-retention assertion', async () => fixture(async ({ root, put }) => {
  const before = await snapshotGate(root);
  await put('trace.zip', 'failed trace sentinel');
  await put('profile/cache', 'failed profile sentinel');
  const result = await finalizeGateFootprint({ root, before, passed: false });
  const assertFailedRetention = async () => {
    assert.equal(result.status, 'retained');
    assert.equal(hash(await fs.readFile(path.join(root, 'trace.zip'))), hash('failed trace sentinel'));
    assert.equal(hash(await fs.readFile(path.join(root, 'profile/cache'))), hash('failed profile sentinel'));
  };
  await assertFailedRetention();
  // Deliberate mutant touches only this fresh fixture; the control must reject it.
  await fs.unlink(path.join(root, 'trace.zip'));
  await assert.rejects(assertFailedRetention(), { code: 'ENOENT' });
}));
