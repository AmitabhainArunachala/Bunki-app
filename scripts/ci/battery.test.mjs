import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { batteryGates, runGates } from '../verify-release-gates.mjs';
import { EventEmitter } from 'node:events';
import { importFlakes, validateFlake } from './import-flakes.mjs';
import {
  aggregate,
  classifyPaths,
  createPlan,
  createRetryPlan,
  digest,
  failureSummary,
  gateForShard,
  withRunnerSignals,
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
  const jobs = [
    ...plan.requiredJobs.map((name, i) => job(name, String(i + 1))),
    job('bunki / fast', '99'),
  ];
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
  return refreshRetryPlans({ plan, jobs, receipts, artifact });
}
function refreshRetryPlans(f) {
  f.retryPlans = (f.plan.scope === 'full' ? ['fast', 'battery'] : ['fast']).map((phase) =>
    createRetryPlan(
      f.plan,
      f.receipts.filter(
        (r) => r.attempt === 1 && f.plan.shards.find((s) => s.id === r.shardId)?.kind === phase,
      ),
      f.artifact,
      undefined,
      phase,
    ),
  );
  f.retryPlan = f.retryPlans.find((r) => r.phase === 'battery') || f.retryPlans[0];
  return f;
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
  refreshRetryPlans(f);
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
  assert.equal(f.plan.requiredNames.length, 150);
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
  assert.equal(result.gates.length, 150);
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
  'passed retry from failed job': (f) => (f.jobs.at(-1).conclusion = 'failure'),
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
  refreshRetryPlans(f);
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
function failFirst(f, name) {
  const one = f.receipts.find((r) => r.attempt === 1 && r.gates.some((g) => g.name === name));
  Object.assign(
    one.gates.find((g) => g.name === name),
    { status: 'failed', exitCode: 1 },
  );
  Object.assign(one, { status: 'failed', exitCode: 1 });
  return one;
}
function addRetry(f, one, status) {
  const jobId = String(5000 + f.receipts.length);
  const two = {
    ...clone(one),
    attempt: 2,
    status,
    exitCode: status === 'passed' ? 0 : 1,
    jobId,
    runner: `fresh-${one.shardId}`,
    gates: one.gates
      .filter((g) => g.status !== 'passed')
      .map((g) => ({ ...gate(g.name), ...(status === 'passed' ? {} : { status, exitCode: 1 }) })),
  };
  f.receipts.push(two);
  f.jobs.push({
    ...job(`retry / ${one.shardId}`, jobId),
    conclusion: status === 'passed' ? 'success' : 'failure',
  });
  return two;
}
function mixedFixture() {
  const f = fixture();
  const history = failFirst(f, 'practice-history');
  const flaky = failFirst(f, 'teaching-context');
  refreshRetryPlans(f);
  return {
    f,
    history,
    flaky,
    failed: addRetry(f, history, 'failed'),
    passed: addRetry(f, flaky, 'passed'),
  };
}
function summaryRows(text) {
  const cells = (line) => line.slice(2, -2).split(' | ');
  const [header, , ...body] = text.split('\n').filter((line) => line.startsWith('| '));
  const keys = cells(header);
  return Object.fromEntries(
    body.map((line) => {
      const row = Object.fromEntries(cells(line).map((value, i) => [keys[i], value]));
      return [row.gate, row];
    }),
  );
}
function rejection(f) {
  try {
    aggregate(f);
  } catch (error) {
    return error;
  }
  assert.fail('Aggregate admitted red evidence');
}
test('red aggregate reaches the explicit second-failure verdict and separates FLAKY from FAILED TWICE', () => {
  const { f } = mixedFixture();
  const error = rejection(f);
  assert.equal(error.message.split('\n')[0], 'Failed twice: practice-history');
  const rows = summaryRows(failureSummary({ ...f, error }));
  assert.equal(Object.keys(rows).length, f.plan.requiredNames.length);
  const history = rows['practice-history'];
  assert.equal(history.result, 'FAILED TWICE');
  assert.equal(
    history['first attempt'],
    `failed (runner-${f.plan.shards.findIndex((s) => s.id === 'practice-history')})`,
  );
  assert.equal(history.retry, 'failed (fresh-practice-history)');
  assert.equal(history['retry seconds'], '1.00');
  assert.match(
    history.evidence,
    /^\[first\]\(.+\/runs\/42\/job\/\d+\) · \[retry\]\(.+\/runs\/42\/job\/5\d+\)$/,
  );
  const flaky = rows['teaching-context'];
  assert.equal(flaky.result, 'FLAKY');
  assert.match(flaky['first attempt'], /^failed \(runner-\d+\)$/);
  assert.match(flaky.retry, /^passed \(fresh-balanced-\d+\)$/);
  assert.equal(flaky.seconds, '1.00');
  assert.equal(flaky['retry seconds'], '1.00');
  assert.equal(rows['format-check'].result, 'PASSED');
  assert.equal(rows['format-check'].retry, '—');
  assert.deepEqual([...new Set(Object.values(rows).map((r) => r.result))].sort(), [
    'FAILED TWICE',
    'FLAKY',
    'PASSED',
  ]);
});
for (const [name, mutate, expected] of [
  ['same retry runner', ({ passed, flaky }) => (passed.runner = flaky.runner)],
  ['reused first job', ({ passed, flaky }) => (passed.jobId = flaky.jobId)],
  ['wrong retry artifact', ({ passed }) => (passed.artifact = { ...artifact, id: '101' })],
  [
    'wrong retry candidate',
    ({ passed }) => (passed.identity = { ...identity, sha: '0'.repeat(40) }),
  ],
  ['wrong retry plan', ({ passed }) => (passed.planDigest = '0'.repeat(64))],
  [
    'extra retried gate',
    ({ passed, flaky }) =>
      passed.gates.push(gate(flaky.gates.find((g) => g.status === 'passed').name)),
  ],
  [
    'wrong retry job identity',
    ({ f, passed }) => (f.jobs.find((j) => j.id === passed.jobId).id = '1'),
  ],
  [
    'stale retry job',
    ({ f, passed }) => (f.jobs.find((j) => j.id === passed.jobId).run_attempt = 2),
  ],
  [
    'passed retry from failed job',
    ({ f, passed }) => (f.jobs.find((j) => j.id === passed.jobId).conclusion = 'failure'),
  ],
  ['duplicate retry', ({ f, passed }) => f.receipts.push(clone(passed))],
  ['untrusted first attempt', ({ flaky }) => (flaky.planDigest = '0'.repeat(64))],
  ['missing artifact metadata', ({ f }) => (f.artifact = undefined)],
  ['interrupted retry', ({ passed }) => (passed.status = 'interrupted'), 'CANCELLED'],
  [
    'cancelled retry without receipt',
    ({ f, passed }) => {
      f.receipts.splice(f.receipts.indexOf(passed), 1);
      f.jobs.find((j) => j.id === passed.jobId).conclusion = 'cancelled';
    },
    'CANCELLED',
  ],
  [
    'missing retry',
    ({ f, passed }) => {
      f.receipts.splice(f.receipts.indexOf(passed), 1);
      f.jobs.splice(
        f.jobs.findIndex((j) => j.id === passed.jobId),
        1,
      );
    },
    'MISSING',
  ],
])
  test(`failure summary never proves a FLAKY pair with ${name}`, () => {
    const fixture = mixedFixture();
    mutate(fixture);
    const error = rejection(fixture.f);
    const text = failureSummary({ ...fixture.f, error });
    const rows = summaryRows(text);
    assert.equal(rows['teaching-context'].result, expected || 'UNVERIFIED');
    assert.match(rows['teaching-context']['first attempt'], /^failed/);
    if (!expected) {
      assert.match(text, /\nUnverified evidence:\n/);
      assert.match(text, new RegExp(`\\n- (?:battery|retry) / ${fixture.flaky.shardId}: `));
    }
    assert(!Object.values(rows).some((r) => r.result === 'FLAKY'));
  });
test('failure summary does not prove FAILED TWICE from a retry on the same runner', () => {
  const { f, history, failed } = mixedFixture();
  failed.runner = history.runner;
  const rows = summaryRows(failureSummary({ ...f, error: rejection(f) }));
  assert.equal(rows['practice-history'].result, 'UNVERIFIED');
  assert.equal(rows['teaching-context'].result, 'FLAKY');
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
  refreshRetryPlans(f);
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

test('fast signal runs independently of absent or slow failing battery/native jobs and cannot produce full proof', () => {
  const f = fixture();
  const fast = f.plan.shards.filter((s) => s.kind === 'fast').map((s) => s.id);
  const receipts = f.receipts.filter((r) => fast.includes(r.shardId));
  const retryPlan = f.retryPlans.find((r) => r.phase === 'fast');
  const jobs = f.jobs.filter(
    (j) => j.name === 'build' || fast.some((id) => j.name === `battery / ${id}`),
  );
  const signal = aggregate({ plan: f.plan, phase: 'fast', receipts, retryPlan, jobs, artifact });
  assert.equal(signal.kind, 'bunki-fast-signal');
  assert.equal(signal.phase, 'fast');
  assert.equal(signal.shards.length, fast.length);
  assert(signal.requiredNames.length < f.plan.requiredNames.length);
  assert.throws(
    () => aggregate({ plan: f.plan, receipts, retryPlans: [retryPlan], jobs, artifact }),
    /execution phase/,
  );
});
test('final aggregation rejects missing, duplicate, unknown or overlapping phase plans and red early signal', () => {
  for (const change of ['missing', 'duplicate', 'unknown', 'overlap', 'red-fast']) {
    const f = fixture();
    if (change === 'missing') f.retryPlans.pop();
    if (change === 'duplicate') f.retryPlans = [f.retryPlans[0], clone(f.retryPlans[0])];
    if (change === 'unknown') {
      f.retryPlans[1].phase = 'all';
      const body = { ...f.retryPlans[1] };
      delete body.retryDigest;
      f.retryPlans[1].retryDigest = digest(body);
    }
    if (change === 'overlap') {
      f.retryPlans[1].shardIds.push(f.retryPlans[0].shardIds[0]);
      const body = { ...f.retryPlans[1] };
      delete body.retryDigest;
      f.retryPlans[1].retryDigest = digest(body);
    }
    if (change === 'red-fast') f.jobs.find((j) => j.name === 'bunki / fast').conclusion = 'failure';
    assert.throws(() => aggregate(f));
  }
});
test('fast first failure is red until exactly one fresh fast retry passes and remains FLAKY', () => {
  const f = fixture();
  const shard = f.plan.shards.find((s) => s.gates.includes('lint'));
  const one = f.receipts.find((r) => r.shardId === shard.id);
  one.status = 'failed';
  one.exitCode = 1;
  const g = one.gates.find((g) => g.name === 'lint');
  g.status = 'failed';
  g.exitCode = 1;
  refreshRetryPlans(f);
  const fastIds = f.plan.shards.filter((s) => s.kind === 'fast').map((s) => s.id);
  const input = {
    plan: f.plan,
    phase: 'fast',
    receipts: f.receipts.filter((r) => fastIds.includes(r.shardId)),
    retryPlan: f.retryPlans[0],
    jobs: f.jobs,
    artifact,
  };
  assert.throws(() => aggregate(input), /Missing\/extra retries/);
  input.receipts.push({
    ...clone(one),
    attempt: 2,
    status: 'passed',
    exitCode: 0,
    jobId: '7777',
    runner: 'fresh-fast-retry',
    gates: [gate('lint')],
  });
  input.jobs.push(job(`retry / ${shard.id}`, '7777'));
  const signal = aggregate(input);
  assert.equal(signal.kind, 'bunki-fast-signal');
  assert.equal(signal.gates.find((g) => g.name === 'lint').status, 'flaky');
});

test('reading-facets installs corpus dependencies even when timing places it away from corpus-pytest', () => {
  const plan = createPlan({
    identity,
    timings: {
      gates: [
        { name: 'reading-facets', maxSeconds: 1000 },
        { name: 'corpus-pytest', maxSeconds: 1000 },
      ],
    },
  });
  const reading = plan.shards.find((s) => s.gates.includes('reading-facets'));
  const corpus = plan.shards.find((s) => s.gates.includes('corpus-pytest'));
  assert.notEqual(reading.id, corpus.id);
  for (const shard of [reading, corpus]) {
    assert.equal(shard.corpus, true);
    assert.equal(shard.python, true);
  }
  assert.equal(plan.shards.find((s) => s.id === 'fast-decks').python, true);
});
test('only dedicated history gates extend timeout while every other command/report/timeout remains canonical', () => {
  const gates = batteryGates('/unused', {});
  const plan = createPlan({ identity });
  for (const gate of gates) {
    const shard = plan.shards.find((s) => s.gates.includes(gate.name));
    const actual = gateForShard(gate, shard, {});
    if (['practice-history', 'practice-history-webkit'].includes(gate.name))
      assert.equal(actual.timeoutMs, 40 * 60 * 1000);
    else assert.equal(actual.timeoutMs, gate.timeoutMs);
    assert.deepEqual(actual.command, gate.command);
    assert.deepEqual(actual.args, gate.args);
    assert.deepEqual(actual.report, gate.report);
  }
  const specific = { name: 'specific-gate', command: process.execPath, args: [], timeoutMs: 1234 };
  assert.equal(
    gateForShard(specific, { id: 'balanced-01', gates: ['specific-gate'] }, {}).timeoutMs,
    1234,
  );
  const defaultGate = { name: 'default-gate', command: process.execPath, args: [] };
  assert.equal(
    Object.hasOwn(
      gateForShard(defaultGate, { id: 'balanced-01', gates: ['default-gate'] }, {}),
      'timeoutMs',
    ),
    false,
  );
  const history = gates.find((g) => g.name === 'practice-history');
  assert.equal(
    gateForShard(history, { id: 'balanced-01', gates: [history.name] }, {}).timeoutMs,
    history.timeoutMs,
  );
});
test('official content guard owns one fast home in both scopes with original assertions intact', () => {
  for (const scope of ['full', 'docs']) {
    const plan = createPlan({ scope, identity });
    assert(plan.requiredNames.includes('official-content-guard'));
    const homes = plan.shards.filter((s) => s.gates.includes('official-content-guard'));
    assert.equal(homes.length, 1);
    assert.equal(homes[0].kind, 'fast');
    const original = batteryGates('/unused', {}).find((g) => g.name === 'official-content-guard');
    assert.deepEqual(gateForShard(original, homes[0], {}), original);
  }
});
test('SIGINT and SIGTERM abort real runGates, retain interrupted terminal evidence, and clean signal listeners', async () => {
  for (const kind of ['SIGINT', 'SIGTERM']) {
    const emitter = new EventEmitter();
    const out = fresh();
    const result = await withRunnerSignals(async (signal) => {
      const pending = runGates({
        gates: [
          {
            name: 'signal-cleanup',
            command: process.execPath,
            args: ['-e', 'setInterval(()=>{},1000)'],
            timeoutMs: 5000,
          },
          { name: 'must-not-run', command: process.execPath, args: ['-e', 'process.exit(0)'] },
        ],
        root: out,
        out,
        signal,
      });
      emitter.emit(kind);
      return pending;
    }, emitter);
    assert.equal(result.status, 'interrupted');
    assert.equal(result.exitCode, 130);
    assert.equal(result.gates[0].status, 'interrupted');
    assert.equal(result.gates[1].status, 'pending');
    assert.equal(emitter.listenerCount('SIGINT'), 0);
    assert.equal(emitter.listenerCount('SIGTERM'), 0);
  }
  const emitter = new EventEmitter();
  await assert.rejects(
    withRunnerSignals(async () => {
      throw new Error('fixture failed');
    }, emitter),
    /fixture failed/,
  );
  assert.equal(emitter.listenerCount('SIGINT'), 0);
  assert.equal(emitter.listenerCount('SIGTERM'), 0);
  await withRunnerSignals(async (signal) => assert.equal(signal.aborted, false), emitter);
  assert.equal(emitter.listenerCount('SIGTERM'), 0);
});
test('cancelled receipt is never retried or promoted even with counterfeit successful job metadata', () => {
  const f = fixture();
  const one = f.receipts[0];
  one.status = 'interrupted';
  one.exitCode = 130;
  one.gates[0].status = 'interrupted';
  one.gates[0].exitCode = 130;
  assert.throws(() => refreshRetryPlans(f), /Shard did not complete/);
  assert.throws(() => aggregate(f), /Shard did not complete/);
});

test('measured healthy canonical gate durations stay below half their selected timeout', () => {
  const plan = createPlan({ identity });
  const timings = JSON.parse(
    readFileSync(new globalThis.URL('../../docs/ci/gate-timings.json', import.meta.url), 'utf8'),
  );
  for (const original of batteryGates('/unused', {})) {
    const measured = timings.gates.find((g) => g.name === original.name);
    assert(measured, `Missing scheduling measurement for ${original.name}`);
    const selected = gateForShard(
      original,
      plan.shards.find((s) => s.gates.includes(original.name)),
      {},
    );
    assert(
      measured.maxSeconds * 1000 < selected.timeoutMs / 2,
      `${original.name} healthy duration approaches timeout`,
    );
  }
});
