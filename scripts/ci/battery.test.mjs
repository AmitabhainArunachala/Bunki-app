import { syntheticEvidence, syntheticProof } from './test-evidence-fixture.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { batteryGates, gateTimeoutMs, runGates } from '../verify-release-gates.mjs';
import { frozenDeck, supplementalGates } from './supplemental.mjs';
import { EventEmitter } from 'node:events';
import { parse as parseYaml } from 'yaml';
import { scheduledBudget, SCHEDULING_POLICY } from './scheduling-budgets.mjs';
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
  validateRetryPlan,
  shardMatrix,
  validateWorkflowSchedule,
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
    ...syntheticEvidence(name, identity.sha, artifact.artifactSha256),
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

test('budgeted deterministic partition covers every original and supplemental gate once', () => {
  const f = fixture();
  // 138 since slice V gated the voice lane: voice-lock, approved-voice-contract and
  // excerpt-narration-contract. The two suites already existed; neither was ever run by CI,
  // which is how a silent build stayed green for seventeen days. None was removed. 139 with
  // narration-media, the first gate to play a shipped clip through a real media element.
  // 145 with the one-hand integration (FINDINGS M-2): F's type-ruby and continuity, R3's
  // sense-truth and the whole word grammar (G1–G6) with its controls, each of the last two
  // one gate per engine. 194 with Kanji-trust, Hfix-2a, SRS, Hfix-2c, Hfix-2d and six Batch 3 lanes, each in both engines, plus FIXR’s gloss classifier.
  assert.equal(f.plan.batteryNames.length, 194);
  // 157 since 1.2.0 added the places-layout gate (the layout under test), 161 with V's four,
  // 167 with the one-hand integration's six; 216 with Kanji-trust, Hfix-2a, SRS, Hfix-2c, Hfix-2d and six Batch 3 lanes
  assert.equal(f.plan.requiredNames.length, 216);
  assert(
    f.plan.shards.filter((s) => s.id.startsWith('balanced-')).length > 10,
    'Actual execution ceilings require deterministic overflow lanes beyond the original ten',
  );
  for (const shard of f.plan.shards) {
    assert(shard.budget.jobTimeoutMinutes <= 360);
    assert(shard.budget.stepTimeoutMinutes < shard.budget.jobTimeoutMinutes);
  }
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
  assert.equal(result.gates.length, 216);
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
const transported = {
  'undefined proof kind': ['typecheck', (p) => delete p.kind],
  'generic retained-report proof for a compiler check': [
    'typecheck',
    () => ({ kind: 'retained-report', obligation: { synthetic: true } }),
  ],
  'generic retained-report proof for a framework gate': [
    'vitest',
    () => ({ kind: 'retained-report', obligation: { synthetic: true } }),
  ],
  'foreign framework roster': ['export', () => syntheticProof('replay')],
  'self-consistent reduced framework roster': [
    'vitest',
    (p) => {
      p.obligation.files.pop();
      p.obligation.filesSha256 = digest(JSON.stringify(p.obligation.files));
    },
  ],
  'foreign retained-report type': ['shelf-search', (p) => (p.obligation.type = 'drift')],
  'adapter obligation of another gate': ['corridor-build', (p) => (p.obligation.adapter = 'skip')],
  'command-check obligation without its declared inputs': [
    'lint',
    (p) => (p.obligation.inputs = p.obligation.inputs.slice(1)),
  ],
  'command-check obligation for another command': [
    'typecheck',
    (p) => (p.obligation.command = 'true'),
  ],
  'command-check obligation for another npm script': [
    'typecheck',
    (p) => (p.obligation.args = ['run', 'lint']),
  ],
  'standalone command-check obligation with a relative output': [
    'standalone-build',
    (p) => (p.obligation.args[1] = 'relative-output'),
  ],
  'extra obligation field': ['lint', (p) => (p.obligation.synthetic = true)],
  'node-test files of another gate': [
    'skip-core',
    (p) => (p.obligation.files = syntheticProof('kanji-capture').obligation.files),
  ],
  'process-probe proof': ['skip-core', () => ({ kind: 'process-probe', obligation: {} })],
};
test('shard admission derives the transported proof kind and obligation shape from the planned gate', () => {
  aggregate(fixture());
  for (const [label, [name, mutate]] of Object.entries(transported)) {
    const f = fixture();
    const receipt = f.receipts.find((r) => r.gates.some((g) => g.name === name));
    const index = receipt.gates.findIndex((g) => g.name === name);
    const proof = syntheticProof(name);
    const mutation = mutate(proof);
    const replaced =
      mutation && typeof mutation === 'object' && !Array.isArray(mutation) ? mutation : proof;
    if (replaced.kind === undefined) delete replaced.kind;
    receipt.gates[index] = {
      ...receipt.gates[index],
      ...syntheticEvidence(name, identity.sha, artifact.artifactSha256, replaced),
    };
    assert.throws(() => aggregate(f), /Transported|transported|Foreign|Test-only/u, label);
    assert.throws(
      () => createRetryPlan(f.plan, f.receipts, f.artifact, undefined, 'all'),
      /Transported|transported|Foreign|Test-only/u,
      label,
    );
  }
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
  const gates = [
    {
      name: 'command-failure',
      command: process.execPath,
      fixtureReceipt: 'process-probe',
      args: ['-e', 'process.exit(9)'],
    },
    {
      name: 'missing-path',
      command: process.execPath,
      fixtureReceipt: 'process-probe',
      args: ['-e', ''],
      requiredPath: 'does-not-exist',
    },
    {
      name: 'timeout',
      command: process.execPath,
      fixtureReceipt: 'process-probe',
      args: ['-e', 'setInterval(()=>{},1000)'],
      timeoutMs: 40,
    },
    {
      name: 'incomplete-report',
      command: process.execPath,
      fixtureReceipt: 'process-probe',
      args: [
        '-e',
        `require('node:fs').writeFileSync(${JSON.stringify(report)},JSON.stringify({total:0,passed:0,results:[]}))`,
      ],
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
            fixtureReceipt: 'process-probe',
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
    assert.notEqual(
      measured.measurementStatus,
      'unmeasured',
      `Unmeasured current contract: ${original.name}; FULL must record an actual completed measurement`,
    );
    assert(
      Number.isFinite(measured.maxSeconds) && measured.maxSeconds > 0,
      `Missing observed duration for ${original.name}`,
    );
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

test('CI contracts provision pytest for actual framework admission regressions', () => {
  const shard = createPlan({ identity }).shards.find((s) => s.gates.includes('ci-contracts'));
  assert(shard, 'Required CI contracts shard');
  assert.equal(shard.python, true);
  assert.equal(shard.corpus, true);
});

const DECK_APKGS = [
  'decks/kotoba-mine/release/kotoba-mine.apkg',
  'decks/kotoba-mine/release/kotoba-mcd.apkg',
  'decks/kotoba-mine/release/public/kotoba-mine.apkg',
  'decks/kotoba-mine/release/public/kotoba-mcd.apkg',
];
function deckRepo(extra = '') {
  const repo = fresh();
  const files = {
    'decks/kotoba-mine/tools/build.py': [
      'import pathlib, sys, time',
      "release = pathlib.Path(__file__).resolve().parents[1] / 'release'",
      "out = release / 'public' if '--profile' in sys.argv else release",
      "for name in ('kotoba-mine.apkg', 'kotoba-mcd.apkg'):",
      '    (out / name).write_bytes(str(time.time_ns()).encode())',
      extra,
      '',
    ].join('\n'),
    'decks/kotoba-mine/release/kotoba-mine.tsv': 'card\n',
    'prototypes/corridor/decks/index.json': '{}\n',
    ...Object.fromEntries(DECK_APKGS.map((file) => [file, `original ${file}`])),
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), text);
  }
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  git('init', '-q');
  git('add', '-A');
  git(
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-qm',
    'fixture',
    '--no-verify',
  );
  return repo;
}
const apkgBytes = (repo) => DECK_APKGS.map((file) => readFileSync(join(repo, file), 'utf8'));
const dirty = (repo) =>
  execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trimEnd();
test('frozen deck build restores its timestamped APKGs and still rejects any other deck mutation', () => {
  const clean = deckRepo();
  const original = apkgBytes(clean);
  frozenDeck(clean);
  assert.deepEqual(apkgBytes(clean), original);
  assert.equal(dirty(clean), '');
  for (const [extra, pattern, left] of [
    [
      "(release / 'kotoba-mine.tsv').write_text('changed\\n')",
      /Command failed: git diff/u,
      ' M decks/kotoba-mine/release/kotoba-mine.tsv',
    ],
    [
      "(release / 'extra.tsv').write_text('new\\n')",
      /Deck build wrote uncommitted outputs/u,
      '?? decks/kotoba-mine/release/extra.tsv',
    ],
    ['sys.exit(3)', /Command failed: python3/u, ''],
  ]) {
    const repo = deckRepo(extra);
    const before = apkgBytes(repo);
    assert.throws(() => frozenDeck(repo), pattern);
    assert.deepEqual(apkgBytes(repo), before, extra);
    assert.equal(dirty(repo), left, extra);
  }
});
test('the per-gate source boundary admits the restoring frozen build and rejects an unrestored APKG rewrite', async () => {
  const supplemental = new globalThis.URL('./supplemental.mjs', import.meta.url).href;
  const probe = (name, args) => ({
    name,
    command: process.execPath,
    fixtureReceipt: 'process-probe',
    args,
    timeoutMs: 30_000,
  });
  const restoring = deckRepo();
  const original = apkgBytes(restoring);
  const admitted = await runGates({
    gates: [
      probe('deck-frozen-fixture', [
        '--input-type=module',
        '-e',
        `import { frozenDeck, supplementalGates } from ${JSON.stringify(supplemental)}; frozenDeck(process.cwd());`,
      ]),
    ],
    root: restoring,
    out: fresh(),
  });
  assert.equal(admitted.status, 'passed', admitted.gates[0].detail);
  assert.deepEqual(apkgBytes(restoring), original);
  const rewriting = deckRepo();
  const rejected = await runGates({
    gates: [
      probe('apkg-rewrite', [
        '-e',
        `require('node:fs').writeFileSync(${JSON.stringify(join(rewriting, DECK_APKGS[0]))}, String(Date.now()))`,
      ]),
    ],
    root: rewriting,
    out: fresh(),
  });
  assert.equal(rejected.gates[0].status, 'incomplete');
  assert.equal(rejected.gates[0].exitCode, 78);
  assert.match(rejected.gates[0].detail, /Source\/input tree changed during gate execution/u);
});
test('a preexisting stdout receipt ends that gate incomplete with a terminal attempt and the battery continues', async () => {
  const out = fresh();
  const taken = join(out, 'stdout-taken.stdout.json');
  writeFileSync(taken, 'stale');
  const probe = (name) => ({
    name,
    command: process.execPath,
    fixtureReceipt: 'process-probe',
    args: ['-e', 'process.exit(0)'],
  });
  const result = await runGates({
    gates: [probe('stdout-taken'), probe('after-stdout')],
    root: out,
    out,
  });
  assert.deepEqual(
    result.gates.map((g) => [g.status, g.exitCode]),
    [
      ['incomplete', 78],
      ['passed', 0],
    ],
  );
  assert.match(result.gates[0].detail, /EEXIST/u);
  assert.equal(
    JSON.parse(readFileSync(result.gates[0].attemptReceipt, 'utf8')).status,
    'incomplete',
  );
  assert.equal(readFileSync(taken, 'utf8'), 'stale');
});
test('child stdout reaches the gate log while the gate is still running, exactly once', async () => {
  const out = fresh();
  const log = join(out, 'live-stdout.log');
  const result = await runGates({
    gates: [
      {
        name: 'live-stdout',
        command: process.execPath,
        fixtureReceipt: 'process-probe',
        args: [
          '-e',
          `process.stdout.write('live-marker\\n');setTimeout(()=>process.exit(require('node:fs').readFileSync(${JSON.stringify(log)},'utf8').includes('live-marker\\n')?0:3),500)`,
        ],
      },
    ],
    root: out,
    out,
  });
  assert.equal(result.gates[0].status, 'passed', result.gates[0].detail);
  assert.equal(readFileSync(join(out, 'live-stdout.stdout.json'), 'utf8'), 'live-marker\n');
  assert.equal(readFileSync(log, 'utf8').split('live-marker\n').length, 2);
  assert(existsSync(result.gates[0].attemptReceipt));
});
test('a gate whose leftover process still holds stdout ends when its own child exits', async () => {
  const out = fresh();
  const pidFile = join(out, 'holder.pid');
  const holder = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`;
  const started = Date.now();
  const result = await runGates({
    gates: [
      {
        name: 'stdout-holder',
        command: process.execPath,
        fixtureReceipt: 'process-probe',
        timeoutMs: 30000,
        args: [
          '-e',
          `process.stdout.write('before-exit\\n'); require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(holder)}], { stdio: ['ignore', 'inherit', 'ignore'], detached: true }).unref();`,
        ],
      },
    ],
    root: out,
    out,
  });
  const elapsed = Date.now() - started;
  if (existsSync(pidFile)) {
    try {
      process.kill(Number(readFileSync(pidFile, 'utf8')), 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  assert.equal(result.gates[0].status, 'passed', result.gates[0].detail);
  assert(elapsed < 15000, 'Gate waited for a leftover stdout holder');
  assert.equal(readFileSync(join(out, 'stdout-holder.stdout.json'), 'utf8'), 'before-exit\n');
});
test('per-engine VH gates that outrun the battery default carry floors of twice their longest healthy run', () => {
  const healthySeconds = {
    'reader-doors': 831,
    'speak-negatives': 1104,
    'reading-truth': 4801,
  };
  const gates = batteryGates('/unused', {});
  const plan = createPlan({ identity });
  for (const [name, seconds] of Object.entries(healthySeconds))
    for (const engine of ['', '-webkit']) {
      const gate = gates.find((g) => g.name === name + engine);
      const selected = gateForShard(
        gate,
        plan.shards.find((s) => s.gates.includes(gate.name)),
        {},
      );
      assert(selected.timeoutMs >= 2 * seconds * 1000, gate.name);
    }
  const raised = batteryGates('/unused', { KAIRO_BATTERY_TIMEOUT_MS: String(4 * 60 * 60 * 1000) });
  for (const name of ['reading-truth', 'record-depth-webkit'])
    assert.equal(raised.find((g) => g.name === name).timeoutMs, 4 * 60 * 60 * 1000);
});

const workflow = () =>
  parseYaml(
    readFileSync(new globalThis.URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  );
const budgetLanes = (shards) =>
  Object.fromEntries(
    ['fast', 'fast-retry', 'battery', 'retry'].map((id) => [
      id,
      shards.filter((s) => s.kind === (id.startsWith('fast') ? 'fast' : 'battery')),
    ]),
  );
function rehash(value, key) {
  const { [key]: previous, ...body } = value;
  assert(previous);
  value[key] = digest(body);
  return value;
}
test('scheduling budgets bind all 216 actual descriptor ceilings and normalized workflow caps', () => {
  const plan = createPlan({ identity });
  const descriptors = [...batteryGates('/unused', {}), ...supplementalGates('/unused')];
  assert.equal(plan.requiredNames.length, 216);
  assert.equal(new Set(plan.shards.flatMap((s) => s.gates)).size, 216);
  assert.equal(validateWorkflowSchedule(workflow(), budgetLanes(plan.shards)), true);
  for (const shard of plan.shards) {
    const expected = shard.gates.map((name) => ({
      name,
      timeoutMs: gateTimeoutMs(
        gateForShard(
          descriptors.find((g) => g.name === name),
          shard,
          {},
        ).timeoutMs,
      ),
    }));
    assert.deepEqual(shard.budget, scheduledBudget(expected));
    assert(shard.budget.jobTimeoutMinutes <= SCHEDULING_POLICY.hostedJobMinutes);
  }
  // Current slow gates retain their authoritative descriptor floors; no timing weight supplies a ceiling.
  const long = plan.shards.find((s) => s.gates.includes('reading-truth-webkit'));
  assert(
    long.budget.gateTimeouts.find((g) => g.name === 'reading-truth-webkit').timeoutMs >=
      3 * 60 * 60 * 1000,
  );
  assert.equal(shardMatrix([long]).include[0].stepTimeoutMinutes, long.budget.stepTimeoutMinutes);
  for (const scope of ['full', 'docs']) {
    const scoped = createPlan({ identity, scope });
    validatePlan(scoped);
    validateWorkflowSchedule(workflow(), budgetLanes(scoped.shards));
    assert.equal(scoped.shards.flatMap((s) => s.gates).length, scoped.requiredNames.length);
    assert.deepEqual(scoped.shards.find((s) => s.id === 'fast-decks').gates, [
      'deck-frozen-build',
      'deck-gloss-ja',
      'deck-export-mcd',
      'deck-segment-overrides',
    ]);
  }
});
test('scheduling rejects missing unknown mismatched and impossible budgets after recomputed digests', () => {
  const original = createPlan({ identity });
  const mutations = [
    (s) => {
      delete s.budget;
    },
    (s) => {
      delete s.budget.gateTimeouts[0].timeoutMs;
    },
    (s) => {
      s.budget.gateTimeouts[0].name = 'unknown-gate';
    },
    (s) => {
      s.budget.gateTimeouts.pop();
    },
    (s) => {
      s.budget.gateTimeouts[0].timeoutMs = 1;
      s.budget = scheduledBudget(s.budget.gateTimeouts);
    },
    (s) => {
      s.budget.stepTimeoutMinutes = 1;
    },
    (s) => {
      s.budget.jobTimeoutMinutes = 1;
    },
  ];
  for (const mutate of mutations) {
    const plan = clone(original);
    mutate(plan.shards[0]);
    assert.throws(() => validatePlan(rehash(plan, 'planDigest')), /budget/i);
  }
  const gates = batteryGates('/unused', {});
  gates.find((g) => g.name === 'reading-truth').timeoutMs = 360 * 60 * 1000;
  assert.throws(() => createPlan({ identity, gates }), /cannot fit.*hosted/);
  const decks = clone(original),
    shard = decks.shards.find((s) => s.id === 'fast-decks');
  shard.gates.reverse();
  shard.budget.gateTimeouts.reverse();
  assert.throws(() => validatePlan(rehash(decks, 'planDigest')), /Frozen deck order/);
});
test('scheduling rejects too-small original and retry step/job caps through actual normalized YAML', () => {
  const plan = createPlan({ identity }),
    lanes = budgetLanes(plan.shards);
  for (const id of Object.keys(lanes)) {
    for (const field of ['step', 'job']) {
      const bad = workflow(),
        job = bad.jobs[id];
      if (field === 'step') job.steps.find((s) => s.id === 'gates')['timeout-minutes'] = 1;
      else job['timeout-minutes'] = 1;
      assert.throws(() => validateWorkflowSchedule(bad, lanes), new RegExp(`${field} cap`, 'i'));
    }
    const huge = workflow();
    huge.jobs[id]['timeout-minutes'] = 361;
    assert.throws(() => validateWorkflowSchedule(huge, lanes), /Job cap/);
    const unbounded = workflow();
    delete unbounded.jobs[id].steps[0]['timeout-minutes'];
    assert.throws(() => validateWorkflowSchedule(unbounded, lanes), /Unbounded setup/);
    const excess = workflow();
    excess.jobs[id].steps.at(-1)['timeout-minutes'] = 21;
    assert.throws(() => validateWorkflowSchedule(excess, lanes), /Retention exceeds/);
    const wrongMatrix = workflow();
    wrongMatrix.jobs[id].strategy.matrix = '${{ fromJSON(needs.plan.outputs.wrong-matrix) }}';
    assert.throws(
      () => validateWorkflowSchedule(wrongMatrix, lanes),
      /Wrong planned matrix source/,
    );
  }
});
test('scheduling retry matrices recalculate only selected failures and preserve dependency order', () => {
  const f = fixture();
  // Exercise both fast retry and battery retry templates with proper subset budgets.
  for (const kind of ['fast', 'battery']) {
    const shard = f.plan.shards.find((s) => s.kind === kind && s.gates.length > 2 && !s.e2e);
    const receipt = f.receipts.find((r) => r.shardId === shard.id);
    receipt.status = 'failed';
    receipt.exitCode = 1;
    for (const row of receipt.gates.slice(0, 2)) {
      row.status = 'failed';
      row.exitCode = 1;
    }
    // Receipt order cannot reverse dependency order in a retry plan.
    receipt.gates.reverse();
  }
  refreshRetryPlans(f);
  const retryShards = f.retryPlans.flatMap((r) => r.shards);
  assert.equal(retryShards.length, 2);
  validateWorkflowSchedule(workflow(), {
    'fast-retry': retryShards.filter((s) => s.kind === 'fast'),
    retry: retryShards.filter((s) => s.kind === 'battery'),
  });
  for (const retry of f.retryPlans) {
    validateRetryPlan(f.plan, retry);
    const selected = retry.shards[0],
      original = f.plan.shards.find((s) => s.id === selected.id);
    assert.deepEqual(selected.gates, original.gates.slice(0, 2));
    assert(selected.budget.stepTimeoutMinutes < original.budget.stepTimeoutMinutes);
    assert(selected.budget.jobTimeoutMinutes < original.budget.jobTimeoutMinutes);
    assert.equal(
      shardMatrix(retry.shards).include[0].stepTimeoutMinutes,
      selected.budget.stepTimeoutMinutes,
    );
    for (const change of ['missing', 'original', 'reversed']) {
      const bad = clone(retry),
        row = bad.shards[0];
      if (change === 'missing') delete row.budget;
      if (change === 'original') row.budget = clone(original.budget);
      if (change === 'reversed') {
        row.gates.reverse();
        row.budget.gateTimeouts.reverse();
      }
      assert.throws(
        () => validateRetryPlan(f.plan, rehash(bad, 'retryDigest')),
        /budget|dependency order/i,
      );
    }
  }
});
