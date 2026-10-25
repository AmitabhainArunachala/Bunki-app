import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import * as support from './footprint-support.mjs';

// Source-only controls: no launcher, native preflight, subprocess, or browser runs.
// Historical approvals are read unchanged; their accepted old bindings are only
// negative-control baselines, never a successor approval or launch authorization.
const TOOLS = dirname(fileURLToPath(import.meta.url));
const P = dirname(TOOLS), FULLR1 = dirname(P);
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const binding = readJson(join(P, 'FREEZE-BINDING.PENDING.json'));
const plan = readJson(join(P, 'FULL-LAUNCH-PLAN.PENDING.json'));
const commands = readJson(join(P, 'PREPARED-COMMANDS.PENDING.json'));
const nativeFixture = join(FULLR1, 'footprint-keep-all-02/native-source');
const cleanupReviewPath = join(FULLR1, 'M1-full-contract-f0e4891d-01/contract-review.W2.json');
const keepAllReviewPath = join(FULLR1, 'footprint-keep-all-02/contract-review.W2.json');
const oldReviewHashes = new Map([cleanupReviewPath, keepAllReviewPath].map(path => [path, hash(path)]));
const noFreezeOutputs = ['contract-review.PENDING.json', 'descriptors.CANDIDATE.json', 'FREEZE-CHECKS.json'];
const outputState = () => Object.fromEntries(noFreezeOutputs.map(name => {
  const path = join(P, name);
  return [name, existsSync(path) ? hash(path) : null];
}));
let freezer;
const importFreezer = async () => freezer ||= await import(pathToFileURL(join(P, 'freeze-descriptors.mjs')).href);
const approvalBinding = (review, pins = review.footprint.pins) => ({
  pins, head: review.sourceHead, artifact: review.artifactSha256,
});
const pinRejection = error => error?.code === 'ERR_ASSERTION'
  && error.message.startsWith('Footprint tooling/source differs from the reviewed pins');

test('packet freezer real import is inert and exposes the actual successor support functions', async () => {
  const before = outputState(), environment = { ...process.env };
  const imported = await importFreezer();
  assert.equal(imported.SUCCESSOR_TOOLS, TOOLS);
  assert.equal(imported.currentFootprintPins, support.currentFootprintPins);
  assert.equal(imported.requireFootprintApproval, support.requireFootprintApproval);
  assert.deepEqual(outputState(), before, 'import cannot freeze candidate files');
  assert.deepEqual({ ...process.env }, environment, 'import cannot sanitize or mutate the parent environment');
});

test('real freezer import rejects actual old cleanup approval specifically at refreshed tooling pins', async () => {
  const imported = await importFreezer();
  const oldReview = readJson(cleanupReviewPath);
  assert.equal(oldReview.status, 'approved');
  assert.equal(oldReview.footprint.scope, 'final-pass-traces-and-owned-profiles-only');
  assert.equal(imported.requireFootprintApproval(oldReview.footprint, approvalBinding(oldReview)), true);
  const actual = imported.currentFootprintPins(TOOLS, nativeFixture);
  assert.deepEqual(actual.native, oldReview.footprint.pins.native, 'frozen native fixture isolates the tool-pin boundary');
  assert.notDeepEqual(actual.tools, oldReview.footprint.pins.tools);
  assert.throws(() => imported.requireFootprintApproval(oldReview.footprint, approvalBinding(oldReview, actual)), pinRejection);
});

test('actual runner selected keep-all validator rejects the unchanged historical keep-all approval pins', async () => {
  const imported = await importFreezer();
  const require = createRequire(join(binding.worktree, 'package.json'));
  const ts = require('typescript');
  const runnerPath = join(TOOLS, 'run-full-r1.mjs');
  const source = readFileSync(runnerPath, 'utf8');
  const ast = ts.createSourceFile(runnerPath, source, ts.ScriptTarget.Latest, true);
  assert.equal(ast.parseDiagnostics.length, 0);
  const matches = ast.statements.filter(node => ts.isFunctionDeclaration(node)
    && node.name?.text === 'requireSelectedFootprintApproval');
  assert.equal(matches.length, 1);
  const selected = vm.runInNewContext(`${matches[0].getText(ast)}; requireSelectedFootprintApproval`, {
    assert, requireFootprintApproval: imported.requireFootprintApproval,
  });
  const oldReview = readJson(keepAllReviewPath);
  assert.equal(oldReview.status, 'approved');
  assert.equal(oldReview.footprint.retentionMode, 'keep-all');
  assert.equal(oldReview.footprint.scope, 'keep-all-no-deletion');
  assert.equal(selected(oldReview.footprint, approvalBinding(oldReview), 'keep-all'), true);
  const actual = imported.currentFootprintPins(TOOLS, nativeFixture);
  assert.deepEqual(actual.native, oldReview.footprint.pins.native);
  assert.throws(() => selected(oldReview.footprint, approvalBinding(oldReview, actual), 'keep-all'), pinRejection);
});

test('actual dd0 worktree remains blocked by all four unchanged native-policy pins', async t => {
  const imported = await importFreezer();
  assert.equal(binding.head, 'dd0d2403a2c79c586e36b9a0ec98c8d38f181394');
  const policyPath = join(TOOLS, 'native-policy.json'), policyHash = hash(policyPath);
  const policy = readJson(policyPath);
  const differences = Object.entries(policy.nativeSourcePins).map(([path, expected]) => ({
    path, expected, actual: hash(join(binding.worktree, path)),
  })).filter(row => row.actual !== row.expected);
  assert.equal(Object.keys(policy.nativeSourcePins).length, 4);
  assert.equal(differences.length, 4, 'report current source mismatch; do not re-key policy to make it pass');
  assert.throws(() => imported.currentFootprintPins(TOOLS, binding.worktree), error =>
    error?.code === 'ERR_ASSERTION' && error.message.startsWith('Footprint native changes must be integrated and source-reviewed'));
  assert.equal(hash(policyPath), policyHash);
  t.diagnostic(JSON.stringify({ observedNativePolicyMismatches: differences }));
});

test('pending freezer refuses before descriptor access, parent environment changes, or output writes', async () => {
  const imported = await importFreezer();
  const before = outputState(), environment = { ...process.env }, reads = [];
  const pending = new Proxy(binding, {
    get(target, key, receiver) {
      reads.push(key);
      assert(['kind', 'status'].includes(key), `pending binding must fail before accessing ${String(key)}`);
      return Reflect.get(target, key, receiver);
    },
  });
  const refusal = error => error?.code === 'ERR_ASSERTION'
    && error.message.startsWith('FULL4 freeze binding is pending');
  assert.throws(() => imported.validateFreezeBinding(pending), refusal);
  await assert.rejects(imported.freezeDescriptors(pending), refusal);
  assert.deepEqual(reads, ['kind', 'status', 'kind', 'status']);
  assert.deepEqual(outputState(), before);
  assert.deepEqual({ ...process.env }, environment);
});

test('pending launch and preflight use the exact successor wrapper and current runtime pins', () => {
  const wrapper = join(TOOLS, 'run-full-r1.mjs');
  const node = '/opt/homebrew/Cellar/node@22/22.23.3/bin/node';
  assert.equal(binding.tools, TOOLS);
  assert.equal(binding.worktree, plan.cwd);
  assert.equal(binding.head, plan.head);
  assert.deepEqual(commands.full, plan.argv);
  assert.deepEqual(plan.argv.slice(0, 2), [node, wrapper]);
  const preflight = [...plan.argv];
  const outIndex = preflight.indexOf('--out');
  assert(outIndex > 0);
  preflight[outIndex + 1] = null;
  preflight.push('--preflight-only');
  assert.deepEqual(commands.preflight, preflight, 'preflight differs only in fresh output and preflight-only flag');
  assert.equal(commands.freezer[1], join(P, 'freeze-descriptors.mjs'));
  assert.equal(commands.freezer[2], join(P, 'FREEZE-BINDING.PENDING.json'));
  assert.equal(commands.launch[2], join(P, 'launch-owned-full.py'));
  assert.equal(plan.argv[plan.argv.indexOf('--contract-review') + 1], join(P, 'contract-review.W2.json'));
  assert.equal(plan.retentionMode, 'keep-all');
  assert.equal(plan.argv[plan.argv.indexOf('--retention') + 1], 'keep-all');
  assert.equal(plan.timeoutSeconds, 86400);
  assert.deepEqual(plan.resourceFloors, {
    load1Max: 16, diskGiBMin: 8, availableMemoryGiBMin: 8,
    memoryPages: ['free', 'inactive', 'speculative', 'purgeable'],
  });
  for (const name of support.TOOL_FILES) {
    const path = join(TOOLS, name);
    assert.equal(plan.pins[path], hash(path), `pending plan must pin actual successor ${name}`);
  }
  assert.equal(commands.noPriorGateCredit, true);
  assert.equal(commands.noConcurrentBuildBrowser, true);
});

test('copied launcher is unchanged and packet remains deliberately unlaunchable with no invented approval', () => {
  const launcher = join(P, 'launch-owned-full.py');
  const historical = join(FULLR1, 'M1-full-launch-f0e4891d-03/launch-owned-full.py');
  assert.deepEqual(readFileSync(launcher), readFileSync(historical));
  assert.equal(hash(launcher), plan.launcherSha256);
  assert.equal(plan.pins[launcher], hash(launcher));
  assert.match(readFileSync(launcher, 'utf8'), /P\/'FULL-LAUNCH-PLAN\.json'/);
  assert.equal(existsSync(join(P, 'FULL-LAUNCH-PLAN.json')), false);
  assert.equal(existsSync(join(P, 'contract-review.W2.json')), false);
  assert.equal(existsSync(join(P, 'FULL-START.json')), false);
  for (const key of ['artifact', 'contract', 'preflightProgress']) assert.equal(plan[key], null, key);
  for (const key of ['site', 'artifact', 'contract', 'sourceProjection', 'outputDirectory']) assert.equal(binding[key], null, key);
  assert.equal(commands.launch.at(-1), null, 'no frozen executable plan hash');
  assert.equal(commands.status, 'pending-not-executable');
  assert.match(plan.status, /^pending-/);
  assert.match(binding.status, /^pending-/);
});

after(() => {
  for (const [path, digest] of oldReviewHashes) assert.equal(hash(path), digest, 'historical approvals must remain byte-identical');
  assert.equal(existsSync(join(P, 'contract-review.W2.json')), false, 'these controls cannot persist an approval');
  assert.equal(existsSync(join(P, 'FULL-LAUNCH-PLAN.json')), false, 'these controls cannot release a launch plan');
});
