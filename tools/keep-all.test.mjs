import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { snapshotGate, finalizeGateFootprint } from './disk-retention.mjs';
import { requireFootprintApproval } from './footprint-support.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sha = x => createHash('sha256').update(x).digest('hex');
const closed = () => ({ closed: true, source: 'pure-control' });
const battery = () => ({ kind: 'kairo-required-battery', status: 'passed', exitCode: 0,
  completedAt: '2026-10-21T00:00:00.000Z', gates: [{ name: 'synthetic', status: 'passed', exitCode: 0, processExitCode: 0 }] });
async function fixture(run) {
  const container = await fs.mkdtemp(path.join(here, '.keep-all-control-'));
  const root = path.join(container, 'gate'); await fs.mkdir(root);
  const put = async (rel, data) => {
    const p = path.join(root, rel); await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, typeof data === 'object' ? JSON.stringify(data) : data);
  };
  const before = await snapshotGate(root);
  await put('trace.zip', 'retain this trace'); await put('profile/Default/cache.bin', 'retain this profile');
  await put('battery.json', battery());
  const args = { root, before, passed: true, evidencePaths: ['battery.json'], closureCheck: closed, retentionMode: 'keep-all' };
  try { await run({ container, root, put, args }); }
  finally { assert.equal(path.dirname(container), here); await fs.rm(container, { recursive: true }); }
}
async function unchanged(root, ledger) {
  assert.equal(ledger.bytesRemoved, 0); assert.equal(ledger.confirmedRemovedBytes, 0);
  assert.deepEqual(ledger.removedFiles, []); assert.deepEqual(ledger.removedDirs, []);
  assert.equal(await fs.readFile(path.join(root, 'trace.zip'), 'utf8'), 'retain this trace');
  assert.equal(await fs.readFile(path.join(root, 'profile/Default/cache.bin'), 'utf8'), 'retain this profile');
}

test('K1 fixture symlink retained without target traversal; identical fixture still blocks default cleanup', async () => {
  for (const mode of ['keep-all', 'cleanup', undefined]) await fixture(async ({ container, root, args }) => {
    const outside = path.join(container, 'outside'); await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'sentinel'), 'outside unchanged');
    await fs.symlink(outside, path.join(root, 'fixture-link'));
    const open = fs.open; let outsideReads = 0;
    fs.open = async (target, ...rest) => { if (String(target).startsWith(outside)) { outsideReads++; throw Error('followed fixture target'); } return open(target, ...rest); };
    let result; try { result = await finalizeGateFootprint({ ...args, retentionMode: mode }); } finally { fs.open = open; }
    assert.equal(outsideReads, 0); await unchanged(root, result);
    assert.equal(result.passed, true); assert.equal(result.symlinks.length, 1);
    assert.equal(result.status, mode === 'keep-all' ? 'retained' : 'blocked');
    assert.equal(result.reason, mode === 'keep-all' ? 'keep-all-policy' : 'symlink-refused');
    assert.equal(result.payloadIntegrity.verified, true);
    const plan = JSON.parse(await fs.readFile(result.inventoryPath, 'utf8'));
    assert(!plan.inventory.files.some(row => row.path.startsWith('fixture-link/')));
    assert.equal(result.bytesKept, plan.inventory.files.reduce((n, row) => n + row.size, 0));
    assert.equal(await fs.readFile(path.join(outside, 'sentinel'), 'utf8'), 'outside unchanged');
  });
});

test('K2 required receipt symlink and symlink ancestor remain blocked in keep-all', async () => {
  for (const ancestor of [false, true]) await fixture(async ({ root, put, args }) => {
    if (ancestor) {
      await put('real/evidence.json', '{}'); await fs.symlink('real', path.join(root, 'proof-link'));
      args.evidencePaths.push('proof-link/evidence.json');
    } else {
      await fs.rename(path.join(root, 'battery.json'), path.join(root, 'actual-battery.json'));
      await fs.symlink('actual-battery.json', path.join(root, 'battery.json'));
    }
    const result = await finalizeGateFootprint(args);
    assert.equal(result.status, 'blocked'); assert.equal(result.reason, 'evidence-not-regular-file'); await unchanged(root, result);
  });
});

test('K3 changed mandatory receipt during closure blocks keep-all', async () => fixture(async ({ root, put, args }) => {
  args.closureCheck = async () => { await put('battery.json', { ...battery(), changed: true }); return closed(); };
  const result = await finalizeGateFootprint(args);
  assert.equal(result.status, 'blocked'); assert.equal(result.reason, 'gate-content-changed-before-cleanup');
  assert.equal(result.payloadIntegrity.verified, false); await unchanged(root, result);
}));

test('K4 unclosed owned process or port and interrupted closure remain blocked', async () => {
  for (const closureCheck of [() => ({ closed: false, pids: [123], ports: [456] }), () => { throw Error('closure-unverified'); }]) {
    await fixture(async ({ root, args }) => {
      const result = await finalizeGateFootprint({ ...args, closureCheck });
      assert.equal(result.status, 'blocked'); assert.notEqual(result.closure.closed, true); await unchanged(root, result);
    });
  }
});

test('K5 native red remains false and all evidence stays; no cleanup or closure claim', async () => fixture(async ({ root, args }) => {
  const result = await finalizeGateFootprint({ ...args, passed: false, closureCheck: () => { throw Error('red should not seek cleanup authority'); } });
  assert.equal(result.passed, false); assert.equal(result.status, 'retained'); assert.equal(result.reason, 'failed-attempt-retained');
  assert.equal(result.closure.closed, false); await unchanged(root, result);
}));

test('K6 keep-all calls no unlink/rmdir, has no deletion plan, and pins preserved evidence', async () => fixture(async ({ root, args }) => {
  const calls = []; const unlink = fs.unlink, rmdir = fs.rmdir;
  fs.unlink = async p => { calls.push(['unlink', p]); throw Error('keep-all invoked unlink'); };
  fs.rmdir = async p => { calls.push(['rmdir', p]); throw Error('keep-all invoked rmdir'); };
  let result; try { result = await finalizeGateFootprint(args); } finally { fs.unlink = unlink; fs.rmdir = rmdir; }
  assert.equal(result.status, 'retained'); assert.deepEqual(calls, []); await unchanged(root, result);
  const plan = JSON.parse(await fs.readFile(result.inventoryPath, 'utf8'));
  assert.deepEqual(plan.deletionPlan.files, []); assert.deepEqual(plan.deletionPlan.dirs, []);
  assert.equal(result.plannedRemovalBytes, 0); assert.equal(result.retentionMode, 'keep-all');
  assert.equal(result.closure.closed, true); assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].after.sha256, sha(await fs.readFile(path.join(root, 'battery.json'))));
  assert.deepEqual(result.evidence[0].before, result.evidence[0].after);
}));

test('K7 unknown modes rejected by helper and real CLI before output creation', async () => {
  await fixture(async ({ root, args }) => {
    const initial = await fs.readdir(root);
    for (const mode of ['', 'all', 'KEEP-ALL', null, false]) {
      await assert.rejects(finalizeGateFootprint({ ...args, retentionMode: mode }), { code: 'invalid-retention-mode' });
      assert.deepEqual(await fs.readdir(root), initial);
    }
  });
  const cli = spawnSync(process.execPath, [path.join(here, 'run-full-r1.mjs'), '--retention', 'typo', '--help'], { encoding: 'utf8' });
  assert.notEqual(cli.status, 0); assert.match(cli.stderr, /Unknown retention mode typo/);
});

test('binding: actual consumer validates selected mode/scope, all tool/native pins and approval identity', async () => {
  const text = await fs.readFile(path.join(here, 'run-full-r1.mjs'), 'utf8');
  const start = text.indexOf('function requireSelectedFootprintApproval(');
  const finish = text.indexOf("const retentionMode = options.retention", start);
  assert(start > 0 && finish > start);
  const validate = vm.runInNewContext(text.slice(start, finish) + '\nrequireSelectedFootprintApproval;', { assert, requireFootprintApproval });
  assert.match(text, /footprintPolicy: \{ retentionMode,/);
  const pins = { tools: Object.fromEntries(['run-full-r1.mjs', 'disk-retention.mjs', 'footprint-support.mjs', 'native-policy.json'].map(f => [f, 'a'.repeat(64)])), native: { native: 'b'.repeat(64) } };
  const binding = { head: 'c'.repeat(40), artifact: 'd'.repeat(64), pins };
  const review = { kind: 'bunki-full-footprint-review', status: 'approved', retentionMode: 'keep-all', scope: 'keep-all-no-deletion',
    sourceHead: binding.head, artifactSha256: binding.artifact, pins, reviewer: 'W2', reviewedAt: '2026-10-22T00:00:00Z' };
  assert(validate(review, binding, 'keep-all'));
  const cleanup = { ...review, retentionMode: 'cleanup', scope: 'final-pass-traces-and-owned-profiles-only' };
  assert(validate(cleanup, binding, 'cleanup')); delete cleanup.retentionMode; assert(validate(cleanup, binding, 'cleanup'));
  for (const change of [v => delete v.retentionMode, v => v.retentionMode = 'cleanup', v => v.scope = 'final-pass-traces-and-owned-profiles-only',
    v => v.scope = 'all-files', v => v.status = 'pending', v => v.sourceHead = 'e'.repeat(40), v => v.artifactSha256 = 'e'.repeat(64),
    v => v.reviewer = '', v => v.reviewedAt = 'invalid', v => delete v.pins.native.native,
    ...Object.keys(pins.tools).map(file => v => v.pins.tools[file] = 'f'.repeat(64))]) {
    const invalid = structuredClone(review); change(invalid); assert.throws(() => validate(invalid, binding, 'keep-all'));
  }
});

test('K1 retarget negative: same-length link change at closure or final inventory is blocked without following targets', async () => {
  for (const when of ['closure', 'final']) await fixture(async ({ root, put, args }) => {
    await put('target-A', 'first'); await put('target-B', 'other');
    const link = path.join(root, 'fixture-link'); await fs.symlink('target-A', link);
    const change = async () => { await fs.unlink(link); await fs.symlink('target-B', link); };
    const readdir = fs.readdir; let rootReads = 0;
    if (when === 'closure') args.closureCheck = async () => { await change(); return closed(); };
    else fs.readdir = async (target, ...rest) => {
      if (target === root && ++rootReads === 3) await change();
      return readdir(target, ...rest);
    };
    let result; try { result = await finalizeGateFootprint(args); } finally { fs.readdir = readdir; }
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, when === 'closure' ? 'gate-content-changed-before-cleanup' : 'retained-symlink-changed');
    assert.equal(result.linkIntegrity.verified, false);
    assert.equal(result.linkIntegrity.before[0].target, 'target-A'); assert.equal(result.linkIntegrity.after[0].target, 'target-B');
    assert.equal(result.linkIntegrity.before[0].size, result.linkIntegrity.after[0].size);
    await unchanged(root, result);
  });
});
