import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { parse } from 'yaml';
import {
  admitRun,
  appendObservations,
  assertLedgerTree,
  isDue,
  LEDGER_PATH,
  LEDGER_REF,
  locate,
  nextRuns,
  observePair,
  persist,
  pendingAttempts,
  PRODUCERS,
  settle,
} from './ledger.mjs';
import { createPlan } from './battery.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));
const workflows = {
  '.github/workflows/ci.yml': 9,
  '.github/workflows/pages-app.yml': 10,
  '.github/workflows/nightly-verify.yml': 11,
};
const callers = {
  ci: { path: '.github/workflows/ci.yml', event: 'pull_request', prefix: '' },
  pages: { path: '.github/workflows/pages-app.yml', event: 'push', prefix: 'verify / ' },
  'pages dispatch': {
    path: '.github/workflows/pages-app.yml',
    event: 'workflow_dispatch',
    prefix: 'verify / ',
    branch: 'codex/ci-revolution-20261007',
  },
  nightly: {
    path: '.github/workflows/nightly-verify.yml',
    event: 'schedule',
    prefix: 'full-battery / ',
  },
};
function fixture(caller = callers.ci) {
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
    repository: { full_name: identity.repository },
    head_repository: { full_name: identity.repository },
    head_sha: identity.sha,
    head_branch: caller.branch ?? 'main',
    path: caller.path,
    workflow_id: workflows[caller.path],
    event: caller.event,
    status: 'completed',
    conclusion: 'failure',
  };
  const jobs = [first, second].map((r) => ({
    id: Number(r.jobId),
    run_id: 42,
    run_attempt: 1,
    runner_name: r.runner,
    name: `${caller.prefix}${r.attempt === 1 ? 'battery' : 'retry'} / ${shard.id}`,
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
  return { plan, artifact, first, second, jobs, run, workflows };
}

for (const [name, caller] of Object.entries(callers))
  test(`observes a ${name} fresh passing retry even when another gate makes the run red`, () => {
    const f = fixture(caller);
    const rows = observePair(f);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].gate, f.first.gates[0].name);
    assert.deepEqual(rows[0].durations, [4, 4]);
    assert.deepEqual(rows[0].jobIds, ['123', '456']);
    assert.deepEqual(rows[0].statuses, ['failed', 'passed']);
  });

for (const [name, mutate] of Object.entries({
  'unprefixed deploy jobs': (f) => {
    for (const job of f.jobs) job.name = job.name.replace(/^verify \/ /, '');
  },
  'another caller prefix': (f) => {
    for (const job of f.jobs) job.name = job.name.replace(/^verify \/ /, 'full-battery / ');
  },
  'arbitrary caller prefix': (f) => {
    for (const job of f.jobs) job.name = job.name.replace(/^verify \/ /, 'attacker / ');
  },
  'another caller workflow id': (f) => {
    f.run.workflow_id = workflows['.github/workflows/nightly-verify.yml'];
  },
  'unlisted caller path': (f) => {
    f.run.path = '.github/workflows/pages-preview.yml';
  },
  'pull request deploy event': (f) => {
    f.run.event = 'pull_request';
  },
  'deploy push off main': (f) => {
    f.run.head_branch = 'feature';
  },
}))
  test(`rejects pages-app evidence with ${name}`, () => {
    const f = fixture(callers.pages);
    mutate(f);
    assert.throws(() => observePair(f), assert.AssertionError);
  });

test('rejects events outside each canonical caller', () => {
  for (const [caller, event] of [
    [callers.ci, 'push'],
    [callers.ci, 'schedule'],
    [callers.nightly, 'push'],
    [callers.nightly, 'pull_request'],
    [callers.pages, 'schedule'],
  ]) {
    const f = fixture(caller);
    f.run.event = event;
    assert.throws(() => observePair(f), /Unexpected producer event/);
  }
});

test('consumer triggers on exactly the canonical callers, whose job prefixes it admits', () => {
  const load = (path) => parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
  const consumer = load('.github/workflows/ci-flake-ledger.yml');
  assert.deepEqual(
    [...consumer.on.workflow_run.workflows].sort(),
    PRODUCERS.map((p) => load(p.path).name).sort(),
  );
  assert.deepEqual(consumer.on.workflow_run.types, ['completed']);
  assert.deepEqual(consumer.permissions, { contents: 'read' });
  assert.deepEqual(consumer.jobs.record.permissions, { contents: 'write', actions: 'read' });
  for (const producer of PRODUCERS) {
    const workflow = load(producer.path);
    assert.deepEqual(
      Object.keys(workflow.on)
        .filter((event) => event !== 'workflow_call')
        .sort(),
      [...producer.events].sort(),
    );
    const callersOfCi = Object.entries(workflow.jobs).filter(
      ([, job]) => job.uses === './.github/workflows/ci.yml',
    );
    if (producer.prefix === '') assert.equal(callersOfCi.length, 0);
    else {
      assert.equal(callersOfCi.length, 1);
      const [[id, job]] = callersOfCi;
      assert.equal(`${job.name ?? id} / `, producer.prefix);
    }
  }
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
  assert.throws(() => admitRun(f.run, f.workflows));
});

const NOW = Date.parse('2026-10-06T00:00:00Z');
const HOUR = 3600 * 1000;
const startedAt = '2026-10-05T23:00:00Z';
const run = (id, attempts = 1) => ({ id, run_attempt: attempts, run_started_at: startedAt });

test('transient failures back off, recover, and never become empty observations', () => {
  const recent = [run(1)];
  let state = {};
  const unavailable = () =>
    locate(
      {
        run: { run_attempt: 1 },
        jobs: [{ name: 'verify / plan', run_attempt: 1, conclusion: 'success' }],
        artifacts: [],
        prefix: 'verify / ',
      },
      'plan',
      'bunki-plan-1-1',
    );
  const failures = [new Error('gh: HTTP 502'), new Error('fetch failed')];
  try {
    unavailable();
  } catch (error) {
    failures.push(error);
  }
  assert.equal(failures.length, 3, 'A missing artifact from a completed job must throw');
  let now = NOW;
  for (const [index, error] of failures.entries()) {
    assert.deepEqual(
      pendingAttempts(recent, state, 'p1', now).map((c) => c.key),
      ['1/1'],
    );
    const entry = settle(error, state['1/1'], { policy: 'p1', startedAt, now });
    assert.equal(entry.result, 'retry');
    assert.equal(entry.failures, index + 1);
    state = nextRuns(state, { '1/1': entry }, now);
    const backoff = 2 ** index * HOUR;
    assert.equal(isDue(state['1/1'], 'p1', now + backoff - 1), false);
    now += backoff;
  }
  assert(!(failures[2] instanceof assert.AssertionError));
  const at = Date.parse(state['1/1'].attemptedAt);
  assert.equal(isDue({ ...state['1/1'], failures: 40 }, 'p1', at + 23 * HOUR), false);
  assert.equal(isDue({ ...state['1/1'], failures: 40 }, 'p1', at + 24 * HOUR), true);
  state = nextRuns(state, { '1/1': { result: 'observed', startedAt } }, now);
  assert.deepEqual(pendingAttempts(recent, state, 'p2', now + 30 * 24 * HOUR), []);
});

test('deterministic rejection is stable and commit-free under one trusted policy', () => {
  const recent = [run(1)];
  const judge = (prior) => {
    const f = fixture();
    f.run.head_repository.full_name = 'x/y';
    try {
      observePair(f);
    } catch (error) {
      return settle(error, prior, { policy: 'p1', startedAt, now: NOW });
    }
    assert.fail('Fork evidence must be rejected');
  };
  const entry = judge();
  assert.equal(entry.result, 'rejected');
  assert(!('attemptedAt' in entry), 'Permanent rejection carries no timestamp churn');
  const state = nextRuns({}, { '1/1': entry }, NOW);
  for (const later of [NOW + HOUR, NOW + 24 * HOUR, NOW + 12 * 24 * HOUR])
    assert.deepEqual(pendingAttempts(recent, state, 'p1', later), []);
  assert.equal(nextRuns(state, { '1/1': judge(state['1/1']) }, NOW + HOUR), state);
  const rerun = locate.bind(null, {
    run: { run_attempt: 2 },
    jobs: [{ name: 'plan', run_attempt: 1, conclusion: 'success' }],
    artifacts: [],
    prefix: '',
  });
  assert.throws(() => rerun('plan', 'bunki-plan-1-2'), /Re-run all jobs is required/);
  try {
    rerun('plan', 'bunki-plan-1-2');
  } catch (error) {
    assert.equal(
      settle(error, undefined, { policy: 'p1', startedAt, now: NOW }).result,
      'rejected',
    );
  }
});

test('policy change reconsiders rejected and backed-off evidence', () => {
  const recent = [run(1), run(2)];
  const state = {
    '1/1': { result: 'rejected', policy: 'p1', startedAt, reason: 'policy differs' },
    '2/1': {
      result: 'retry',
      policy: 'p1',
      startedAt,
      failures: 5,
      attemptedAt: new Date(NOW).toISOString(),
      reason: 'HTTP 502',
    },
  };
  assert.deepEqual(pendingAttempts(recent, state, 'p1', NOW + HOUR), []);
  assert.deepEqual(
    pendingAttempts(recent, state, 'p2', NOW + HOUR).map((c) => c.key),
    ['1/1', '2/1'],
  );
});

test('pruning drops only expired scheduling metadata and never ledger rows', () => {
  const rows = observePair(fixture());
  const ledger = appendObservations('', rows);
  const old = new Date(NOW - 16 * 24 * HOUR).toISOString();
  const previous = {
    '1/1': { result: 'observed', startedAt: old },
    '2/1': { result: 'rejected', policy: 'p1', startedAt: old, reason: 'fork' },
    '3/1': { result: 'observed', startedAt },
  };
  assert.equal(nextRuns(previous, {}, NOW), previous, 'Pruning alone never writes');
  const runs = nextRuns(previous, { '4/1': { result: 'observed', startedAt } }, NOW);
  assert.deepEqual(Object.keys(runs), ['3/1', '4/1']);
  const written = [];
  persist(
    {
      parent: 'b'.repeat(40),
      ledger: appendObservations(ledger, []),
      runs,
      previousLedger: ledger,
      previousRuns: previous,
      temp: '/runner-temp/ledger',
    },
    (args, options) => {
      if (args[0] === 'hash-object') written.push(options.input);
      return 'a'.repeat(40);
    },
  );
  assert.equal(written[0], ledger);
  assert.deepEqual(JSON.parse(written[1]), runs);
});

test('backed-off attempts never starve newer observations', () => {
  const recent = Array.from({ length: 25 }, (_, i) => run(i + 1));
  const state = Object.fromEntries(
    recent.slice(0, 20).map((r) => [
      `${r.id}/1`,
      {
        result: 'retry',
        policy: 'p1',
        startedAt,
        failures: 1,
        attemptedAt: new Date(NOW).toISOString(),
        reason: 'HTTP 502',
      },
    ]),
  );
  assert.deepEqual(
    pendingAttempts(recent, state, 'p1', NOW).map((r) => r.id),
    [21, 22, 23, 24, 25],
  );
  const later = pendingAttempts(recent, state, 'p1', NOW + HOUR).map((r) => r.id);
  assert.deepEqual(later.slice(0, 5), [21, 22, 23, 24, 25]);
  assert.equal(later.length, 20);
  assert(later.includes(1));
});

test('an old-created run with a new triggered attempt is prioritized outside the lookback', () => {
  const recent = Array.from({ length: 25 }, (_, i) => run(i + 100));
  const pending = pendingAttempts(recent, {}, 'p1', NOW, {
    id: 1,
    run_attempt: 7,
    run_started_at: startedAt,
  });
  assert.equal(pending.length, 20);
  assert.deepEqual(pending[0], { id: 1, attempt: 7, key: '1/7', startedAt, triggered: true });
});
