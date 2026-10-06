import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admitRun,
  appendObservations,
  assertLedgerTree,
  LEDGER_PATH,
  LEDGER_REF,
  observePair,
  persist,
  pendingAttempts,
} from './ledger.mjs';
import { createPlan } from './battery.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));
function fixture() {
  const identity = {
    repository: 'AmitabhainArunachala/Bunki-app',
    sha: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    runId: '42',
    runAttempt: 1,
    policyDigest: 'c'.repeat(64),
  };
  const plan = createPlan({ identity });
  const shard = plan.shards.find((s) => s.gates.length > 2);
  const artifact = {
    id: '100',
    name: 'bunki-site-42-1',
    digest: `sha256:${'d'.repeat(64)}`,
    artifactSha256: 'e'.repeat(64),
    manifestSha256: 'f'.repeat(64),
    producerSha: identity.sha,
  };
  const boundary = {
    artifactSha256: artifact.artifactSha256,
    manifestSha256: artifact.manifestSha256,
    gitSha: identity.sha,
    sourceDirty: false,
    verifiedAt: '2026-10-06T00:00:01Z',
  };
  const gate = (name, status) => ({
    name,
    status,
    exitCode: status === 'passed' ? 0 : 1,
    log: '/evidence/gate.log',
    startedAt: '2026-10-06T00:00:01Z',
    completedAt: '2026-10-06T00:00:05Z',
  });
  const first = {
    schemaVersion: 1,
    kind: 'bunki-ci-shard',
    identity,
    planDigest: plan.planDigest,
    artifact,
    shardId: shard.id,
    attempt: 1,
    jobId: '123',
    runner: 'runner-one',
    status: 'failed',
    exitCode: 1,
    before: boundary,
    after: boundary,
    startedAt: '2026-10-06T00:00:00Z',
    completedAt: '2026-10-06T00:00:08Z',
    gates: shard.gates.map((n, i) => gate(n, i < 2 ? 'failed' : 'passed')),
  };
  // One retry passes while another fails twice: the overall run stays red.
  const second = {
    ...clone(first),
    attempt: 2,
    jobId: '456',
    runner: 'runner-two',
    gates: [gate(shard.gates[0], 'passed'), gate(shard.gates[1], 'failed')],
  };
  const run = {
    id: 42,
    run_attempt: 1,
    workflow_id: 9,
    repository: { full_name: identity.repository },
    head_repository: { full_name: identity.repository },
    head_sha: identity.sha,
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'failure',
  };
  const jobs = [first, second].map((r) => ({
    id: Number(r.jobId),
    run_id: 42,
    run_attempt: 1,
    runner_name: r.runner,
    name: `${r.attempt === 1 ? 'battery' : 'retry'} / ${shard.id}`,
    status: 'completed',
    conclusion: r.attempt === 1 ? 'success' : 'failure',
    started_at: '2026-10-06T00:00:00Z',
    completed_at: '2026-10-06T00:00:09Z',
    steps: [
      {
        name:
          r.attempt === 1
            ? 'Run the exact planned gates and retain first failures'
            : 'Run the exact planned gates and record the second and final attempt',
        number: 5,
        status: 'completed',
        conclusion: 'failure',
        started_at: '2026-10-06T00:00:00Z',
        completed_at: '2026-10-06T00:00:08Z',
      },
    ],
  }));
  return { plan, artifact, first, second, jobs, run, workflowId: 9 };
}

test('observes a fresh passing retry even when another gate makes the run red', () => {
  const f = fixture();
  const rows = observePair(f);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].gate, f.first.gates[0].name);
  assert.deepEqual(rows[0].durations, [4, 4]);
  assert.deepEqual(rows[0].jobIds, ['123', '456']);
  assert.deepEqual(rows[0].statuses, ['failed', 'passed']);
});

for (const [name, mutate] of Object.entries({
  'fork producer': (f) => {
    f.run.head_repository.full_name = 'other/repo';
  },
  'wrong workflow': (f) => {
    f.run.workflow_id++;
  },
  'wrong path': (f) => {
    f.run.path = '.github/workflows/untrusted.yml';
  },
  'wrong event': (f) => {
    f.run.event = 'pull_request_target';
  },
  'unfinished producer': (f) => {
    f.run.status = 'in_progress';
  },
  'wrong run attempt': (f) => {
    f.run.run_attempt++;
  },
  'wrong job id': (f) => {
    f.jobs[1].id++;
  },
  'wrong job runner': (f) => {
    f.jobs[1].runner_name = 'pretend';
  },
  'same runner': (f) => {
    f.second.runner = f.first.runner;
    f.jobs[1].runner_name = f.first.runner;
  },
  'cancelled retry': (f) => {
    f.jobs[1].conclusion = 'cancelled';
  },
  'never ran step': (f) => {
    f.jobs[1].steps = [];
  },
  'timestamps outside job': (f) => {
    f.second.gates[0].completedAt = '2026-10-07T00:00:05Z';
  },
  'missing retry failure': (f) => {
    f.second.gates.pop();
  },
  'grafted passing gate': (f) => {
    f.second.gates.push(clone(f.first.gates[2]));
  },
  'mismatched artifact': (f) => {
    f.second.artifact.digest = `sha256:${'9'.repeat(64)}`;
  },
  'missing artifact boundary': (f) => {
    f.second.after = null;
  },
  'interrupted receipt': (f) => {
    f.second.status = 'interrupted';
  },
}))
  test(`rejects ${name}`, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => observePair(f));
  });

test('first continue-on-error conclusion is accepted only for a complete report', () => {
  const f = fixture();
  f.jobs[0].steps[0].conclusion = 'success';
  assert.equal(observePair(f).length, 1);
  f.jobs[0].steps[0].conclusion = 'cancelled';
  assert.throws(() => observePair(f));
});

test('append is byte-preserving and duplicate evidence is idempotent', () => {
  const rows = observePair(fixture());
  const existing = appendObservations('', rows);
  assert.equal(appendObservations(existing, rows), existing);
  const next = clone(rows[0]);
  next.runId = '43';
  next.evidence = next.evidence.map((s) => s.replace('/runs/42/', '/runs/43/'));
  assert(appendObservations(existing, [next]).startsWith(existing));
  const conflicting = clone(rows[0]);
  conflicting.durations[0]++;
  assert.throws(() => appendObservations(existing, [conflicting]), /Conflicting/);
  const controlled = clone(rows[0]);
  controlled.source = 'controlled-experiment';
  assert.throws(() => appendObservations('', [controlled]));
});

test('ledger tree rejects unexpected paths, symlinks and candidate source files', () => {
  const tree = `100644 blob ${'a'.repeat(40)}\t${LEDGER_PATH}\n100644 blob ${'b'.repeat(40)}\tdocs/ci/flake-runs.json`;
  assertLedgerTree(tree);
  for (const bad of [
    tree.replace('100644', '120000'),
    tree + `\n100644 blob ${'c'.repeat(40)}\tpackage.json`,
    tree.replace(LEDGER_PATH, 'other.jsonl'),
  ])
    assert.throws(() => assertLedgerTree(bad));
});

test('writer uses only isolated index and fixed normal fast-forward data destination', () => {
  const calls = [];
  const execute = (args, options) => {
    calls.push({ args, options });
    return 'a'.repeat(40);
  };
  const data = {
    parent: 'b'.repeat(40),
    ledger: 'data\n',
    runs: { '42/1': { result: 'observed' } },
    previousLedger: '',
    previousRuns: {},
    temp: '/runner-temp/ledger',
  };
  assert.equal(persist(data, execute), 'a'.repeat(40));
  assert.deepEqual(calls.at(-1).args, ['push', 'origin', `${'a'.repeat(40)}:${LEDGER_REF}`]);
  assert(calls.every((c) => c.options.env.GIT_INDEX_FILE === '/runner-temp/ledger/ledger-index'));
  assert.deepEqual(
    calls.filter((c) => c.args[0] === 'update-index').map((c) => c.args.at(-1).split(',')[2]),
    [LEDGER_PATH, 'docs/ci/flake-runs.json'],
  );
  assert(
    !calls.some(
      (c) => c.args.includes('--force') || ['checkout', 'reset', 'init'].includes(c.args[0]),
    ),
  );
  const count = calls.length;
  assert.equal(
    persist({ ...data, previousLedger: data.ledger, previousRuns: data.runs }, execute),
    null,
  );
  assert.equal(calls.length, count);
});

test('unknown run metadata fails before observation admission', () => {
  const f = fixture();
  f.run.id = 'not-numeric';
  assert.throws(() => admitRun(f.run, f.workflowId));
});

test('rejected attempts remain retryable without starving newer observations', () => {
  const recent = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, run_attempt: 1 }));
  const now = Date.parse('2026-10-06T00:00:00Z');
  const state = Object.fromEntries(
    recent
      .slice(0, 20)
      .map((r) => [
        `${r.id}/1`,
        { result: 'rejected', consumer: 'one', attemptedAt: new Date(now).toISOString() },
      ]),
  );
  assert.deepEqual(
    pendingAttempts(recent, state, 'one', now).map((r) => r.id),
    [21, 22, 23, 24, 25],
  );
  assert(pendingAttempts(recent, state, 'one', now + 3600001).some((r) => r.id === 1));
  assert(pendingAttempts(recent, state, 'two', now).some((r) => r.id === 1));
  state['1/1'].result = 'observed';
  assert(!pendingAttempts(recent, state, 'two', now).some((r) => r.id === 1));
});

test('an old-created run with a new triggered attempt is prioritized outside the lookback', () => {
  const recent = Array.from({ length: 25 }, (_, i) => ({ id: i + 100, run_attempt: 1 }));
  const pending = pendingAttempts(recent, {}, 'consumer', Date.now(), { id: 1, run_attempt: 7 });
  assert.equal(pending.length, 20);
  assert.deepEqual(pending[0], { id: 1, attempt: 7, key: '1/7', triggered: true });
});
