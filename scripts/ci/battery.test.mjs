import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runGates } from '../verify-release-gates.mjs';
import { importFlakes, validateFlake } from './import-flakes.mjs';
import {
  aggregate,
  classifyPaths,
  createPlan,
  createRetryPlan,
  digest,
  failureSummary,
  loadReceipts,
  summary,
  validatePlan,
} from './battery.mjs';
const parent =
  process.env.CI && process.env.RUNNER_TEMP
    ? join(process.env.RUNNER_TEMP, 'ci-runner-tests')
    : join(homedir(), '.dharma/bunki_review/2026-10-06/ci/runner-tests');
mkdirSync(parent, { recursive: true });
const fresh = () => mkdtempSync(join(parent, 'case-'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const identity = {
  repository: 'AmitabhainArunachala/Bunki-app',
  sha: 'a'.repeat(40),
  tree: 'b'.repeat(40),
  runId: '42',
  runAttempt: 1,
  policyDigest: 'c'.repeat(64),
};
const artifact = {
  id: '100',
  name: 'bunki-site-42-1',
  digest: `sha256:${'d'.repeat(64)}`,
  artifactSha256: 'e'.repeat(64),
  manifestSha256: 'f'.repeat(64),
  producerSha: identity.sha,
};
function fixture() {
  const plan = createPlan({ identity });
  const jobs = plan.requiredJobs.map((name, i) => job(name, String(i + 1)));
  const receipts = plan.shards.map((shard, i) => {
    const jobId = String(i + 100);
    jobs.push(job(`battery / ${shard.id}`, jobId));
    return {
      schemaVersion: 1,
      kind: 'bunki-ci-shard',
      status: 'passed',
      identity,
      planDigest: plan.planDigest,
      shardId: shard.id,
      attempt: 1,
      artifact,
      jobId,
      runner: `runner-${i}`,
      startedAt: '2026-10-05T00:00:00Z',
      completedAt: '2026-10-05T00:01:00Z',
      exitCode: 0,
      before: proof(),
      after: proof(),
      gates: shard.gates.map((name) => gate(name)),
    };
  });
  return { plan, jobs, receipts, artifact, retryPlan: createRetryPlan(plan, receipts, artifact) };
}
function gate(name) {
  return {
    name,
    status: 'passed',
    exitCode: 0,
    startedAt: '2026-10-05T00:00:00Z',
    completedAt: '2026-10-05T00:00:01Z',
    log: `/evidence/${name}.log`,
  };
}
function proof() {
  return {
    artifactSha256: artifact.artifactSha256,
    manifestSha256: artifact.manifestSha256,
    gitSha: identity.sha,
    sourceDirty: false,
    verifiedAt: '2026-10-05T00:00:00Z',
  };
}
function job(name, id) {
  return {
    name,
    id,
    status: 'completed',
    conclusion: 'success',
    run_id: 42,
    run_attempt: 1,
    started_at: '2026-10-05T00:00:00Z',
    completed_at: '2026-10-05T00:01:00Z',
  };
}
function failedFixture() {
  const f = fixture();
  const first = f.receipts.find((r) => r.shardId === 'practice-history');
  first.status = 'failed';
  first.exitCode = 1;
  first.gates[0].status = 'failed';
  first.gates[0].exitCode = 1;
  f.jobs.find((j) => String(j.id) === first.jobId).conclusion = 'success';
  f.retryPlan = createRetryPlan(f.plan, f.receipts, f.artifact);
  return f;
}
function withRetry() {
  const f = failedFixture();
  const first = f.receipts.find((r) => r.shardId === 'practice-history');
  const retry = {
    ...clone(first),
    attempt: 2,
    status: 'passed',
    exitCode: 0,
    jobId: '999',
    runner: 'fresh-retry',
    gates: first.gates.map((g) => gate(g.name)),
  };
  f.receipts.push(retry);
  f.jobs.push(job(`retry / ${first.shardId}`, retry.jobId));
  return f;
}

test('measured deterministic partition covers every original and supplemental gate once', () => {
  const f = fixture();
  assert.equal(f.plan.batteryNames.length, 135);
  assert.equal(f.plan.requiredNames.length, 149);
  assert.equal(f.plan.shards.filter((s) => s.id.startsWith('balanced-')).length, 10);
  assert.deepEqual(createPlan({ identity }), f.plan);
  for (const s of f.plan.shards.filter((s) => s.kind === 'fast')) assert(s.predictedSeconds <= 480);
  assert.deepEqual(f.plan.shards.find((s) => s.id === 'practice-history').gates, [
    'practice-history',
  ]);
  assert.deepEqual(f.plan.shards.find((s) => s.id === 'practice-history-webkit').gates, [
    'practice-history-webkit',
  ]);
  const e = f.plan.shards.find((s) => s.gates.includes('e2e'));
  assert(e.gates.includes('e2e-build'));
  assert(e.gates.indexOf('e2e-build') < e.gates.indexOf('e2e'));
});
test('partition rejects deletion even with recomputed digest', () => {
  const f = fixture();
  f.plan.shards[0].gates.pop();
  const body = { ...f.plan };
  delete body.planDigest;
  f.plan.planDigest = digest(body);
  assert.throws(() => validatePlan(f.plan), /Partition/);
});
test('complete successful evidence promotes full proof and unified summary', () => {
  const f = fixture();
  const result = aggregate(f);
  assert.equal(result.kind, 'bunki-full-battery');
  assert.equal(result.gates.length, 149);
  assert.match(summary(result), /Slowest ten/);
});
const mutations = {
  'no receipts': (f) => (f.receipts = []),
  'missing shard': (f) => f.receipts.pop(),
  'duplicate shard': (f) => f.receipts.push(clone(f.receipts[0])),
  'missing gate': (f) => f.receipts[0].gates.pop(),
  'duplicate gate': (f) => f.receipts[0].gates.push(clone(f.receipts[0].gates[0])),
  'unknown gate': (f) => (f.receipts[0].gates[0].name = 'unknown-gate'),
  'wrong shard': (f) => (f.receipts[0].shardId = 'unknown-shard'),
  'running shard': (f) => (f.receipts[0].status = 'running'),
  'interrupted gate': (f) => (f.receipts[0].gates[0].status = 'interrupted'),
  'pending gate': (f) => (f.receipts[0].gates[0].status = 'pending'),
  'absent completion': (f) => (f.receipts[0].completedAt = null),
  'nonzero successful receipt': (f) => (f.receipts[0].exitCode = 1),
  'wrong schema': (f) => (f.receipts[0].schemaVersion = 2),
  'wrong run': (f) => (f.receipts[0].identity = { ...identity, runId: '43' }),
  'wrong attempt': (f) => (f.receipts[0].identity = { ...identity, runAttempt: 2 }),
  'wrong sha': (f) => (f.receipts[0].identity = { ...identity, sha: '0'.repeat(40) }),
  'wrong tree': (f) => (f.receipts[0].identity = { ...identity, tree: '0'.repeat(40) }),
  'wrong plan': (f) => (f.receipts[0].planDigest = '0'.repeat(64)),
  'wrong artifact id': (f) => (f.receipts[0].artifact = { ...artifact, id: '101' }),
  'wrong artifact archive': (f) =>
    (f.receipts[0].artifact = { ...artifact, digest: `sha256:${'0'.repeat(64)}` }),
  'wrong runtime digest': (f) => (f.receipts[0].after.artifactSha256 = '0'.repeat(64)),
  'wrong manifest digest': (f) => (f.receipts[0].after.manifestSha256 = '0'.repeat(64)),
  'dirty artifact': (f) => (f.receipts[0].after.sourceDirty = true),
  'failed after verification': (f) => (f.receipts[0].after = null),
  'missing job': (f) => f.jobs.pop(),
  'cancelled shard job': (f) => (f.jobs.at(-1).conclusion = 'cancelled'),
  'skipped shard job': (f) => (f.jobs.at(-1).conclusion = 'skipped'),
  'never-started shard': (f) => (f.jobs.at(-1).started_at = null),
  'running job': (f) => (f.jobs.at(-1).status = 'in_progress'),
  'wrong job run': (f) => (f.jobs.at(-1).run_id = 43),
  'stale job attempt': (f) => (f.jobs.at(-1).run_attempt = 2),
  'wrong job id': (f) => (f.jobs.at(-1).id = '987'),
  'red build': (f) => (f.jobs.find((j) => j.name === 'build').conclusion = 'failure'),
  'red native': (f) => (f.jobs.find((j) => j.name === 'native').conclusion = 'failure'),
  'no native': (f) => (f.jobs = f.jobs.filter((j) => j.name !== 'native')),
  'no artifact id': (f) => {
    f.artifact = { ...artifact };
    delete f.artifact.id;
  },
};
for (const [name, mutate] of Object.entries(mutations))
  test(`aggregate rejects ${name}`, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => aggregate(f));
  });
test('failed gate is eligible once, fresh passing retry is loud FLAKY with both attempts', () => {
  const f = withRetry();
  const result = aggregate(f);
  const row = result.gates.find((g) => g.name === 'practice-history');
  assert.equal(row.status, 'flaky');
  assert.equal(row.attempts.length, 2);
  assert.equal(result.flakes.length, 1);
  assert.match(summary(result), /FLAKY/);
});
test('no retry after failure rejects', () =>
  assert.throws(() => aggregate(failedFixture()), /Missing\/extra retries/));
for (const [name, mutate] of Object.entries({
  'second failure': (f) => {
    const r = f.receipts.at(-1);
    r.status = 'failed';
    r.exitCode = 1;
    r.gates[0].status = 'failed';
    r.gates[0].exitCode = 1;
    f.jobs.at(-1).conclusion = 'failure';
  },
  'third attempt': (f) => (f.receipts.at(-1).attempt = 3),
  'same job': (f) =>
    (f.receipts.at(-1).jobId = f.receipts.find((r) => r.shardId === 'practice-history').jobId),
  'same runner': (f) =>
    (f.receipts.at(-1).runner = f.receipts.find((r) => r.shardId === 'practice-history').runner),
  'retry extra passed gate': (f) => f.receipts.at(-1).gates.push(gate('lint')),
  'retry plan removes failure': (f) => {
    f.retryPlan.shards = [];
    const body = { ...f.retryPlan };
    delete body.retryDigest;
    f.retryPlan.retryDigest = digest(body);
  },
  'cancelled retry': (f) => (f.jobs.at(-1).conclusion = 'cancelled'),
}))
  test(`retry rejects ${name}`, () => {
    const f = withRetry();
    mutate(f);
    assert.throws(() => aggregate(f));
  });
test('docs receipt is a distinct non-full proof and unknown/deleted implementation paths force full', () => {
  assert.equal(classifyPaths(['docs/operator/example.md']), 'docs');
  for (const paths of [
    [],
    null,
    ['docs/ci/DESIGN.md'],
    ['docs/srs/foo.md'],
    ['.github/workflows/ci.yml'],
    ['scripts/example.mjs'],
    ['package-lock.json'],
    ['apps/app/a.ts'],
  ])
    assert.equal(classifyPaths(paths), 'full');
  const f = fixture();
  const plan = createPlan({ scope: 'docs', identity });
  f.plan = plan;
  f.receipts = f.receipts
    .filter((r) => plan.shards.some((s) => s.id === r.shardId))
    .map((r) => ({ ...r, planDigest: plan.planDigest }));
  f.retryPlan = createRetryPlan(plan, f.receipts, artifact);
  assert.equal(aggregate(f).kind, 'bunki-docs-check');
});
test('missing directory, empty directory and malformed receipts fail closed', () => {
  assert.throws(() => loadReceipts(join(fresh(), 'missing')));
  assert.throws(() => loadReceipts(fresh()));
  const dir = fresh();
  writeFileSync(join(dir, 'shard.json'), '{');
  assert.throws(() => loadReceipts(dir));
});
test('real canonical runGates rejects command failure, missing file, timeout, incomplete report and interruption', async () => {
  const out = fresh();
  const report = join(out, 'report.json');
  writeFileSync(report, JSON.stringify({ total: 0, passed: 0, results: [] }));
  const gates = [
    { name: 'command-failure', command: process.execPath, args: ['-e', 'process.exit(9)'] },
    {
      name: 'missing-path',
      command: process.execPath,
      args: ['-e', ''],
      requiredPath: 'does-not-exist',
    },
    {
      name: 'timeout',
      command: process.execPath,
      args: ['-e', 'setInterval(()=>{},1000)'],
      timeoutMs: 40,
    },
    {
      name: 'incomplete-report',
      command: process.execPath,
      args: ['-e', ''],
      report: { path: report, type: 'checks' },
    },
  ];
  const result = await runGates({ gates, root: out, out });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(
    result.gates.map((g) => g.status),
    ['failed', 'missing', 'timed-out', 'incomplete'],
  );
  const controller = new globalThis.AbortController();
  controller.abort();
  const interrupted = await runGates({
    gates: [gates[0]],
    root: out,
    out: fresh(),
    signal: controller.signal,
  });
  assert.equal(interrupted.status, 'interrupted');
  assert.equal(interrupted.exitCode, 130);
});

test('failure summary retains expected rows, cancelled/missing shards, retry durations and slow ten without proof', () => {
  const f = withRetry();
  const row = f.receipts.pop();
  f.receipts.pop();
  f.jobs.at(-1).conclusion = 'cancelled';
  const text = failureSummary({ ...f, error: new Error('cancelled shard') });
  assert.match(text, /Admission rejected/);
  assert.match(text, /Slowest ten observed/);
  assert.match(text, /MISSING/);
  assert.match(text, /practice-history/);
  assert.match(text, /format-check/);
  assert(row);
});
test('flake importer admits only exact observed pair, deduplicates and rejects malformed/conflicting evidence', () => {
  const pair = aggregate(withRetry()).flakes[0];
  validateFlake(pair);
  const dir = fresh();
  const ledger = join(dir, 'ledger.jsonl'),
    input = join(dir, 'input.jsonl');
  writeFileSync(ledger, '');
  writeFileSync(input, JSON.stringify(pair) + '\n');
  assert.deepEqual(importFlakes(ledger, input), { added: 1, total: 1 });
  assert.deepEqual(importFlakes(ledger, input), { added: 0, total: 1 });
  for (const change of [
    { statuses: ['passed', 'passed'] },
    { attempts: [1, 3] },
    { durations: [-1, 2] },
    { runner: pair.firstRunner },
    { jobIds: [pair.jobIds[0], pair.jobIds[0]] },
    { evidence: ['https://example.com', 'https://example.com'] },
    { sha: 'bad' },
  ])
    assert.throws(() => validateFlake({ ...pair, ...change }));
  writeFileSync(input, JSON.stringify({ ...pair, durations: [2, 3] }) + '\n');
  assert.throws(() => importFlakes(ledger, input), /Conflicting/);
});
test('retry failed e2e consumes prior passed export identity; changed export dependency is rejected', () => {
  const f = fixture();
  const one = f.receipts.find((r) => r.gates.some((g) => g.name === 'e2e'));
  const item = one.gates.find((g) => g.name === 'e2e');
  item.status = 'failed';
  item.exitCode = 1;
  one.status = 'failed';
  one.exitCode = 1;
  assert.throws(() => createRetryPlan(f.plan, f.receipts, artifact), /passed build digest/);
  one.dependencies = { e2eBuild: { sha256: '1'.repeat(64), files: 10 } };
  f.retryPlan = createRetryPlan(f.plan, f.receipts, artifact);
  assert.deepEqual(f.retryPlan.shards[0].gates, ['e2e']);
  const retry = {
    ...clone(one),
    attempt: 2,
    status: 'passed',
    exitCode: 0,
    jobId: '9999',
    runner: 'fresh-e2e-runner',
    gates: [gate('e2e')],
  };
  f.receipts.push(retry);
  f.jobs.push(job(`retry / ${one.shardId}`, '9999'));
  aggregate(f);
  retry.dependencies.e2eBuild.sha256 = '2'.repeat(64);
  assert.throws(() => aggregate(f), /dependency identity changed/);
});

test('a recomputed plan digest cannot separate E2E dependency or dismantle history isolation', () => {
  for (const change of ['e2e', 'history']) {
    const f = fixture();
    const from = f.plan.shards.find((s) =>
      s.gates.includes(change === 'e2e' ? 'e2e-build' : 'practice-history'),
    );
    const to = f.plan.shards.find((s) => s.id === 'balanced-01');
    const name = change === 'e2e' ? 'e2e-build' : 'practice-history';
    const other = to.gates[0];
    from.gates[from.gates.indexOf(name)] = other;
    to.gates[0] = name;
    const body = { ...f.plan };
    delete body.planDigest;
    f.plan.planDigest = digest(body);
    assert.throws(() => validatePlan(f.plan));
  }
});

test('retry planning forbids cancelled or failed infrastructure jobs despite complete failed gate rows', () => {
  for (const conclusion of ['cancelled', 'failure', 'skipped']) {
    const f = failedFixture();
    f.jobs.find((j) => j.name === 'battery / practice-history').conclusion = conclusion;
    assert.throws(() => createRetryPlan(f.plan, f.receipts, f.artifact, f.jobs), /Job failed/);
  }
});
