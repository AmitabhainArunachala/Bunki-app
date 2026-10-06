/** Trusted default-branch consumer. Observations are data, never deployment authority. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { admitReceipt, createPlan, policyDigest } from './battery.mjs';
import { validateFlake } from './import-flakes.mjs';
import { assertArtifactMetadata, REPOSITORY } from './receipts.mjs';

export const LEDGER_REF = 'refs/heads/ci/flake-ledger';
export const LEDGER_PATH = 'docs/ci/flakes.jsonl';
const STATE_PATH = 'docs/ci/flake-runs.json';
const POLICY_PATHS = [
  '.github/workflows',
  '.github/actions',
  'scripts/ci',
  'scripts/verify-release-gates.mjs',
  'docs/ci/gate-timings.json',
];
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const sha = (value) => assert.match(value || '', /^[a-f0-9]{40}$/);
const endpoint = (suffix) => `repos/${REPOSITORY}/${suffix}`;
const api = (path) =>
  JSON.parse(execFileSync('gh', ['api', path], { maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' }));
const git = (args, options = {}) =>
  execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  }).trim();
const pages = (path, key) =>
  JSON.parse(
    execFileSync('gh', ['api', '--paginate', '--slurp', path], {
      maxBuffer: 32 * 1024 * 1024,
      encoding: 'utf8',
    }),
  ).flatMap((p) => p[key]);
const stepName = (attempt) =>
  attempt === 1
    ? 'Run the exact planned gates and retain first failures'
    : 'Run the exact planned gates and record the second and final attempt';

export function admitRun(run, workflowId) {
  assert.equal(run.repository?.full_name, REPOSITORY);
  assert.equal(run.head_repository?.full_name, REPOSITORY, 'Fork observations are not admitted');
  assert.equal(run.workflow_id, workflowId);
  assert.equal(run.path, '.github/workflows/ci.yml');
  assert(['pull_request', 'workflow_dispatch'].includes(run.event));
  assert.equal(run.status, 'completed');
  assert.match(String(run.id), /^\d+$/);
  assert(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
  sha(run.head_sha);
}

function admitJob(record, jobs, run) {
  const name = `${record.attempt === 1 ? 'battery' : 'retry'} / ${record.shardId}`;
  const matches = jobs.filter((j) => j.name === name);
  assert.equal(matches.length, 1, 'Missing or duplicate hosted job');
  const job = matches[0];
  assert.equal(String(job.id), record.jobId);
  assert.equal(job.run_id, run.id);
  assert.equal(job.run_attempt, run.run_attempt);
  assert.equal(job.status, 'completed');
  assert(['success', 'failure'].includes(job.conclusion), 'Interrupted hosted job');
  assert.equal(job.runner_name, record.runner);
  const steps = job.steps.filter((s) => s.name === stepName(record.attempt));
  assert.equal(steps.length, 1, 'Missing gate execution step');
  const step = steps[0];
  assert.equal(step.status, 'completed');
  if (record.attempt === 1 && record.status === 'failed')
    assert(
      ['success', 'failure'].includes(step.conclusion),
      'First step did not complete (continue-on-error)',
    );
  else assert.equal(step.conclusion, record.status === 'passed' ? 'success' : 'failure');
  assert(
    job.steps
      .filter((s) => s.number < step.number)
      .every((s) => ['success', 'skipped'].includes(s.conclusion)),
    'Setup failed before gate execution',
  );
  for (const gate of record.gates) {
    const start = Date.parse(gate.startedAt),
      end = Date.parse(gate.completedAt);
    // Server timestamps have second precision; reports retain milliseconds.
    assert(
      start >= Date.parse(step.started_at) - 1000 && end <= Date.parse(step.completed_at) + 1000,
      'Gate outside hosted execution interval',
    );
    assert(
      start >= Date.parse(job.started_at) - 1000 && end <= Date.parse(job.completed_at) + 1000,
      'Gate outside hosted job',
    );
  }
}

export function observePair({ plan, artifact, first, second, jobs, run, workflowId }) {
  admitRun(run, workflowId);
  assert.equal(plan.identity.repository, REPOSITORY);
  assert.equal(String(plan.identity.runId), String(run.id));
  assert.equal(plan.identity.runAttempt, run.run_attempt);
  const shard = plan.shards.find((s) => s.id === first.shardId);
  assert(shard, 'Unknown shard');
  admitReceipt(plan, first, shard, 1, artifact);
  const failures = first.gates.filter((g) => g.status !== 'passed').map((g) => g.name);
  assert(failures.length > 0);
  admitReceipt(plan, second, shard, 2, artifact, failures);
  admitJob(first, jobs, run);
  admitJob(second, jobs, run);
  assert.notEqual(first.jobId, second.jobId);
  assert.notEqual(first.runner, second.runner);
  return second.gates
    .filter((g) => g.status === 'passed')
    .map((retry) => {
      const original = first.gates.find((g) => g.name === retry.name);
      return validateFlake({
        schemaVersion: 1,
        source: 'observed-ci',
        gate: retry.name,
        sha: plan.identity.sha,
        runId: plan.identity.runId,
        runAttempt: run.run_attempt,
        runner: second.runner,
        firstRunner: first.runner,
        durations: [original, retry].map(
          (g) => (Date.parse(g.completedAt) - Date.parse(g.startedAt)) / 1000,
        ),
        jobIds: [first.jobId, second.jobId],
        attempts: [1, 2],
        statuses: [original.status, retry.status],
        evidence: [first.jobId, second.jobId].map(
          (id) => `https://github.com/${REPOSITORY}/actions/runs/${run.id}/job/${id}`,
        ),
      });
    });
}

export function appendObservations(existing, incoming) {
  assert(!existing || existing.endsWith('\n'), 'Ledger must end in a newline');
  const key = (r) => `${r.runId}/${r.runAttempt}/${r.gate}`;
  const rows = existing
    .split('\n')
    .filter(Boolean)
    .map((line) => validateFlake(JSON.parse(line)));
  const seen = new Map(rows.map((r) => [key(r), r]));
  assert.equal(seen.size, rows.length, 'Duplicate existing evidence');
  const added = [];
  for (const row of [...incoming].sort(
    (a, b) =>
      Number(a.runId) - Number(b.runId) ||
      a.runAttempt - b.runAttempt ||
      a.gate.localeCompare(b.gate),
  )) {
    validateFlake(row);
    assert.equal(row.source, 'observed-ci');
    const prior = seen.get(key(row));
    if (prior) assert.deepEqual(prior, row, 'Conflicting flake evidence');
    else {
      seen.set(key(row), row);
      added.push(row);
    }
  }
  return existing + added.map((r) => `${JSON.stringify(r)}\n`).join('');
}

export function assertLedgerTree(tree) {
  const entries = tree.split('\n').filter(Boolean);
  assert(
    entries.every((line) => /^100644 blob [a-f0-9]{40}\t/.test(line)),
    'Ledger tree must contain regular files only',
  );
  const paths = entries.map((line) => line.split('\t')[1]).sort();
  assert.deepEqual(paths, [LEDGER_PATH, STATE_PATH].sort(), 'Unexpected ledger destination paths');
}

export function pendingAttempts(recent, state, consumer, now = Date.now(), trigger) {
  const requested = trigger
    ? {
        id: trigger.id,
        attempt: trigger.run_attempt,
        key: `${trigger.id}/${trigger.run_attempt}`,
        triggered: true,
      }
    : null;
  const candidates = recent
    .flatMap((run) =>
      Array.from({ length: run.run_attempt }, (_, i) => ({
        id: run.id,
        attempt: i + 1,
        key: `${run.id}/${i + 1}`,
      })),
    )
    .filter(({ key }) => key !== requested?.key);
  if (requested) candidates.unshift(requested);
  return candidates
    .filter(
      ({ key, triggered }) =>
        state[key]?.result !== 'observed' &&
        (triggered ||
          !state[key] ||
          state[key].consumer !== consumer ||
          now - Date.parse(state[key].attemptedAt) >= 3600 * 1000),
    )
    .sort(
      (a, b) =>
        Number(!!b.triggered) - Number(!!a.triggered) ||
        (Date.parse(state[a.key]?.attemptedAt) || 0) -
          (Date.parse(state[b.key]?.attemptedAt) || 0) ||
        a.id - b.id ||
        a.attempt - b.attempt,
    )
    .slice(0, 20);
}

/** ZIP is digest-checked; only one bounded JSON member is read, never extracted. */
export function readArtifact(artifact, runId, member, temp) {
  assertArtifactMetadata(artifact, { runId });
  assert(artifact.size_in_bytes <= 8 * 1024 * 1024, 'Oversized observation artifact');
  const bytes = execFileSync('gh', ['api', endpoint(`actions/artifacts/${artifact.id}/zip`)], {
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(`sha256:${hash(bytes)}`, artifact.digest, 'Observation archive digest mismatch');
  const file = join(temp, `${artifact.id}.zip`);
  writeFileSync(file, bytes);
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        'import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n names=z.namelist(); allowed=[sys.argv[2]]+(["parity.json"] if sys.argv[2]=="plan.json" else [])\n assert len(names)==len(set(names)) and sys.argv[2] in names and all(n in allowed for n in names), "unexpected archive members"\n i=z.getinfo(sys.argv[2]); assert i.file_size<=4194304, "oversized JSON"\n sys.stdout.buffer.write(z.read(i))',
        file,
        member,
      ],
      { maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
    ),
  );
}

function observeRun(run, workflowId, temp) {
  admitRun(run, workflowId);
  const artifacts = pages(endpoint(`actions/runs/${run.id}/artifacts?per_page=100`), 'artifacts');
  const find = (name) => {
    const found = artifacts.filter((a) => a.name === name);
    assert.equal(found.length, 1, `Missing/duplicate observation artifact: ${name}`);
    return found[0];
  };
  const suffix = `${run.id}-${run.run_attempt}`;
  const plan = readArtifact(find(`bunki-plan-${suffix}`), run.id, 'plan.json', temp);
  sha(plan.identity.sha);
  const commit = api(endpoint(`commits/${plan.identity.sha}`));
  assert.equal(commit.commit.tree.sha, plan.identity.tree);
  assert(
    plan.identity.sha === run.head_sha || commit.parents.some((p) => p.sha === run.head_sha),
    'Producer is unrelated to hosted head',
  );
  git(['fetch', '--no-tags', 'origin', plan.identity.sha]);
  // Compare actual Git blobs, not a producer's claimed policy digest.
  assert.equal(
    git(['ls-tree', '-r', plan.identity.sha, '--', ...POLICY_PATHS]),
    git(['ls-tree', '-r', 'HEAD', '--', ...POLICY_PATHS]),
    'Producer verification policy differs from trusted default branch',
  );
  assert.equal(plan.identity.policyDigest, policyDigest());
  assert.deepEqual(
    plan,
    createPlan({ scope: plan.scope, identity: plan.identity }),
    'Producer plan differs from trusted policy',
  );
  const artifact = readArtifact(
    find(`bunki-build-metadata-${suffix}`),
    run.id,
    'artifact.json',
    temp,
  );
  assertArtifactMetadata(api(endpoint(`actions/artifacts/${artifact.id}`)), {
    runId: run.id,
    id: artifact.id,
    name: artifact.name,
    digest: artifact.digest,
  });
  const jobs = pages(
    endpoint(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`),
    'jobs',
  );
  const rows = [];
  for (const shard of plan.shards) {
    const name = `bunki-shard-${shard.id}-2-${suffix}`;
    if (!artifacts.some((a) => a.name === name)) continue;
    const first = readArtifact(
      find(`bunki-shard-${shard.id}-1-${suffix}`),
      run.id,
      'shard.json',
      temp,
    );
    const second = readArtifact(find(name), run.id, 'shard.json', temp);
    rows.push(...observePair({ plan, artifact, first, second, jobs, run, workflowId }));
  }
  return rows;
}

function readState() {
  const refs = git(['ls-remote', '--heads', 'origin', LEDGER_REF]);
  if (!refs)
    return {
      parent: null,
      ledger: existsSync(join(ROOT, LEDGER_PATH))
        ? readFileSync(join(ROOT, LEDGER_PATH), 'utf8')
        : '',
      runs: {},
    };
  const parent = refs.split(/\s/)[0];
  sha(parent);
  git(['fetch', '--no-tags', 'origin', parent]);
  assertLedgerTree(git(['ls-tree', '-r', parent]));
  const ledger = execFileSync('git', ['show', `${parent}:${LEDGER_PATH}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  appendObservations(ledger, []);
  const runs = JSON.parse(git(['show', `${parent}:${STATE_PATH}`]));
  assert(runs && !Array.isArray(runs) && typeof runs === 'object');
  return { parent, ledger, runs };
}

/** Fixed data-only destination; no checkout/reset, index mutation, force, or main write. */
export function persist(
  { parent, ledger, runs, previousLedger, previousRuns, temp },
  execute = git,
) {
  if (ledger === previousLedger && JSON.stringify(runs) === JSON.stringify(previousRuns))
    return null;
  if (parent) sha(parent);
  const env = {
    ...process.env,
    GIT_INDEX_FILE: join(temp, 'ledger-index'),
    GIT_AUTHOR_NAME: 'bunki-ci',
    GIT_AUTHOR_EMAIL: 'actions@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'bunki-ci',
    GIT_COMMITTER_EMAIL: 'actions@users.noreply.github.com',
  };
  const command = (args, input) =>
    execute(args, { env, ...(input === undefined ? {} : { input }) });
  command(['read-tree', ...(parent ? [parent] : ['--empty'])]);
  for (const [path, data] of [
    [LEDGER_PATH, ledger],
    [STATE_PATH, `${JSON.stringify(runs, null, 2)}\n`],
  ]) {
    const blob = command(['hash-object', '-w', '--stdin'], data);
    sha(blob);
    command(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
  }
  const tree = command(['write-tree']);
  sha(tree);
  const commit = command([
    'commit-tree',
    tree,
    ...(parent ? ['-p', parent] : []),
    '-m',
    'Record observed CI retry evidence',
  ]);
  sha(commit);
  command(['push', 'origin', `${commit}:${LEDGER_REF}`]);
  return commit;
}

async function main() {
  assert.equal(process.env.GITHUB_REPOSITORY, REPOSITORY);
  const repository = api(`repos/${REPOSITORY}`);
  assert.equal(
    process.env.GITHUB_REF,
    `refs/heads/${repository.default_branch}`,
    'Consumer must run on the default branch',
  );
  assert.equal(
    git(['rev-parse', 'HEAD']),
    process.env.GITHUB_SHA,
    'Checkout must be the trusted consumer SHA',
  );
  assert.equal(
    git(['remote', 'get-url', 'origin']).replace(/\.git$/, ''),
    `https://github.com/${REPOSITORY}`,
  );
  assert(process.env.RUNNER_TEMP);
  const temp = mkdtempSync(join(process.env.RUNNER_TEMP, 'flake-ledger-'));
  const workflow = api(endpoint('actions/workflows/ci.yml'));
  const since = new Date(Date.now() - 13 * 24 * 3600 * 1000).toISOString();
  // Reconcile retained evidence even when GitHub replaces a pending consumer run.
  const recent = pages(
    endpoint(
      `actions/workflows/${workflow.id}/runs?status=completed&created=%3E%3D${encodeURIComponent(since)}&per_page=100`,
    ),
    'workflow_runs',
  );
  const initial = readState();
  const updates = {},
    observations = [];
  let processed = 0;
  const trigger =
    process.env.GITHUB_EVENT_NAME === 'workflow_run'
      ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).workflow_run
      : undefined;
  for (const { id, attempt, key } of pendingAttempts(
    recent,
    initial.runs,
    process.env.GITHUB_SHA,
    Date.now(),
    trigger,
  )) {
    processed++;
    try {
      const run = api(endpoint(`actions/runs/${id}/attempts/${attempt}`));
      observations.push(...observeRun(run, workflow.id, temp));
      updates[key] = { result: 'observed', consumer: process.env.GITHUB_SHA };
    } catch (error) {
      updates[key] = {
        result: 'rejected',
        consumer: process.env.GITHUB_SHA,
        attemptedAt: new Date().toISOString(),
        reason: String(error.message).split('\n')[0].slice(0, 240),
      };
      console.log(`::warning title=Flake evidence rejected::Run ${key}: ${updates[key].reason}`);
    }
  }
  // Ordinary fast-forward push plus bounded reload handles any concurrent human append.
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = attempt ? readState() : initial;
    const ledger = appendObservations(state.ledger, observations);
    try {
      const commit = persist({
        ...state,
        ledger,
        runs: { ...state.runs, ...updates },
        previousLedger: state.ledger,
        previousRuns: state.runs,
        temp,
      });
      console.log(
        JSON.stringify({
          processed,
          observations: observations.length,
          commit,
          destination: LEDGER_REF,
        }),
      );
      return;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
