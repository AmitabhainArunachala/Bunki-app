/** Trusted default-branch consumer. Observations are data, never deployment authority. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
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
const HOUR = 3600 * 1000;
// Artifacts are retained 14 days; one extra day covers the attempt's own duration.
const SCHEDULE_RETENTION = 15 * 24 * HOUR;
/** Canonical same-repository callers of the one CI pipeline and their reusable-job prefixes. */
export const PRODUCERS = [
  { path: '.github/workflows/ci.yml', events: ['pull_request', 'workflow_dispatch'], prefix: '' },
  {
    path: '.github/workflows/pages-app.yml',
    events: ['push', 'workflow_dispatch'],
    prefix: 'verify / ',
  },
  {
    path: '.github/workflows/nightly-verify.yml',
    events: ['schedule', 'workflow_dispatch'],
    prefix: 'full-battery / ',
  },
];
class Unavailable extends Error {}
const available = (condition, message) => {
  if (!condition) throw new Unavailable(message);
};
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

export function admitRun(run, workflows) {
  assert.equal(run.repository?.full_name, REPOSITORY);
  assert.equal(run.head_repository?.full_name, REPOSITORY, 'Fork observations are not admitted');
  const producer = PRODUCERS.find((p) => p.path === run.path);
  assert(producer, 'Unexpected producer workflow');
  assert(Number.isSafeInteger(run.workflow_id), 'Producer workflow id missing');
  assert.equal(run.workflow_id, workflows[producer.path], 'Unexpected producer workflow id');
  assert(producer.events.includes(run.event), 'Unexpected producer event');
  if (run.event === 'push') assert.equal(run.head_branch, 'main', 'Deploy runs come from main');
  available(run.status === 'completed', 'Producer still running');
  assert.match(String(run.id), /^\d+$/);
  assert(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
  sha(run.head_sha);
  return producer;
}

function admitJob(record, jobs, run, prefix) {
  const name = `${prefix}${record.attempt === 1 ? 'battery' : 'retry'} / ${record.shardId}`;
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

export function observePair({ plan, artifact, first, second, jobs, run, workflows }) {
  const { prefix } = admitRun(run, workflows);
  assert.equal(plan.identity.repository, REPOSITORY);
  assert.equal(String(plan.identity.runId), String(run.id));
  assert.equal(plan.identity.runAttempt, run.run_attempt);
  const shard = plan.shards.find((s) => s.id === first.shardId);
  assert(shard, 'Unknown shard');
  admitReceipt(plan, first, shard, 1, artifact);
  const failures = first.gates.filter((g) => g.status !== 'passed').map((g) => g.name);
  assert(failures.length > 0);
  admitReceipt(plan, second, shard, 2, artifact, failures);
  admitJob(first, jobs, run, prefix);
  admitJob(second, jobs, run, prefix);
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

/** Assertion failures judge immutable evidence; anything else may succeed later. */
export function settle(error, prior, { policy, startedAt, now }) {
  const reason = String(error.message).split('\n')[0].slice(0, 240);
  if (error instanceof assert.AssertionError)
    return { result: 'rejected', policy, startedAt, reason };
  return {
    result: 'retry',
    policy,
    startedAt,
    failures: (prior?.result === 'retry' ? prior.failures : 0) + 1,
    attemptedAt: new Date(now).toISOString(),
    reason,
  };
}

export function isDue(entry, policy, now) {
  if (!entry) return true;
  if (entry.result === 'observed') return false;
  if (entry.policy !== policy) return true;
  if (entry.result === 'rejected') return false;
  const backoff = Math.min(2 ** (entry.failures - 1), 24) * HOUR;
  return !(now - Date.parse(entry.attemptedAt) < backoff);
}

export function pendingAttempts(recent, state, policy, now = Date.now(), trigger) {
  const requested = trigger
    ? {
        id: trigger.id,
        attempt: trigger.run_attempt,
        key: `${trigger.id}/${trigger.run_attempt}`,
        startedAt: trigger.run_started_at,
        triggered: true,
      }
    : null;
  const candidates = recent
    .flatMap((run) =>
      Array.from({ length: run.run_attempt }, (_, i) => ({
        id: run.id,
        attempt: i + 1,
        key: `${run.id}/${i + 1}`,
        startedAt: run.run_started_at,
      })),
    )
    .filter(({ key }) => key !== requested?.key);
  if (requested) candidates.unshift(requested);
  return candidates
    .filter(
      ({ key, triggered }) =>
        state[key]?.result !== 'observed' && (triggered || isDue(state[key], policy, now)),
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

/** Scheduling metadata only; pruning rides along with real writes and never touches the ledger. */
export function nextRuns(previous, updates, now = Date.now()) {
  const merged = { ...previous, ...updates };
  if (JSON.stringify(merged) === JSON.stringify(previous)) return previous;
  return Object.fromEntries(
    Object.entries(merged).filter(
      ([, entry]) => !(now - Date.parse(entry.startedAt) > SCHEDULE_RETENTION),
    ),
  );
}

/** A hosted job of this exact attempt must have produced the artifact before it can be late. */
export function locate({ run, jobs, artifacts, prefix }, job, name) {
  const producers = jobs.filter((j) => j.name === `${prefix}${job}`);
  assert.equal(producers.length, 1, `Missing or duplicate hosted job: ${prefix}${job}`);
  assert.equal(
    producers[0].run_attempt,
    run.run_attempt,
    `${prefix}${job} did not run in this attempt; Re-run all jobs is required`,
  );
  assert(
    ['success', 'failure'].includes(producers[0].conclusion),
    `Interrupted hosted job: ${prefix}${job}`,
  );
  const found = artifacts.filter((a) => a.name === name);
  assert(found.length <= 1, `Duplicate observation artifact: ${name}`);
  available(found.length === 1, `Observation artifact not yet available: ${name}`);
  return found[0];
}

const ranGates = (job, run) => {
  const step = job.steps?.find((s) => s.name === stepName(2));
  return (
    job.run_attempt === run.run_attempt &&
    ['success', 'failure'].includes(job.conclusion) &&
    step?.status === 'completed' &&
    ['success', 'failure'].includes(step.conclusion)
  );
};

const INCOMPLETE = new Set(['running', 'interrupted', 'infrastructure-failed']);

/** A bound runner report that never completed its gates has no pass to pair. */
function incompleteRetry({ plan, artifact, shard, receipt, job }) {
  if (!INCOMPLETE.has(receipt.status)) return false;
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.kind, 'bunki-ci-shard');
  assert.deepEqual(receipt.identity, plan.identity, 'Receipt provenance mismatch');
  assert.equal(receipt.planDigest, plan.planDigest);
  assert.equal(receipt.shardId, shard.id);
  assert.equal(receipt.attempt, 2);
  assert.deepEqual(receipt.artifact, artifact, 'Artifact provenance mismatch');
  assert.equal(
    job.steps.find((s) => s.name === stepName(2)).conclusion,
    'failure',
    'Incomplete retry report from a successful step',
  );
  return true;
}

/** Pairs every retry that reached its gates; a cancelled or setup-failed retry has no report. */
export function observeShards({ plan, artifact, run, jobs, artifacts, workflows }, read) {
  const { prefix } = admitRun(run, workflows);
  const evidence = { run, jobs, artifacts, prefix };
  const suffix = `${run.id}-${run.run_attempt}`;
  return plan.shards.flatMap((shard) => {
    const job = jobs.find((j) => j.name === `${prefix}retry / ${shard.id}` && ranGates(j, run));
    if (!job) return [];
    const [first, second] = [
      ['battery', 1],
      ['retry', 2],
    ].map(([name, attempt]) =>
      read(
        locate(evidence, `${name} / ${shard.id}`, `bunki-shard-${shard.id}-${attempt}-${suffix}`),
      ),
    );
    if (incompleteRetry({ plan, artifact, shard, receipt: second, job })) return [];
    return observePair({ plan, artifact, first, second, jobs, run, workflows });
  });
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
  let json;
  try {
    json = execFileSync(
      'python3',
      [
        '-c',
        'import sys,zipfile\ntry:\n with zipfile.ZipFile(sys.argv[1]) as z:\n  names=z.namelist(); allowed=[sys.argv[2]]+(["parity.json"] if sys.argv[2]=="plan.json" else [])\n  assert len(names)==len(set(names)) and sys.argv[2] in names and all(n in allowed for n in names), "unexpected archive members"\n  i=z.getinfo(sys.argv[2]); assert i.file_size<=4194304, "oversized JSON"\n  data=z.read(i)\nexcept Exception as e:\n sys.stderr.write(str(e)); sys.exit(3)\nsys.stdout.buffer.write(data)',
        file,
        member,
      ],
      { maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
    );
  } catch (error) {
    if (error.status === 3) assert.fail(`Malformed observation archive: ${error.stderr}`);
    throw error;
  }
  try {
    return JSON.parse(json);
  } catch {
    assert.fail(`Malformed observation JSON: ${member}`);
  }
}

function observeRun(run, workflows, temp) {
  const { prefix } = admitRun(run, workflows);
  const jobs = pages(
    endpoint(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`),
    'jobs',
  );
  // Only an executed retry can pair a failure with a fresh-runner pass.
  if (!jobs.some((j) => j.name.startsWith(`${prefix}retry / `) && ranGates(j, run))) return [];
  const artifacts = pages(endpoint(`actions/runs/${run.id}/artifacts?per_page=100`), 'artifacts');
  const evidence = { run, jobs, artifacts, prefix };
  const suffix = `${run.id}-${run.run_attempt}`;
  const plan = readArtifact(
    locate(evidence, 'plan', `bunki-plan-${suffix}`),
    run.id,
    'plan.json',
    temp,
  );
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
    locate(evidence, 'build', `bunki-build-metadata-${suffix}`),
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
  return observeShards({ plan, artifact, run, jobs, artifacts, workflows }, (found) =>
    readArtifact(found, run.id, 'shard.json', temp),
  );
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
  const workflows = Object.fromEntries(
    PRODUCERS.map(({ path }) => {
      const workflow = api(endpoint(`actions/workflows/${basename(path)}`));
      assert.equal(workflow.path, path);
      return [path, workflow.id];
    }),
  );
  const now = Date.now();
  const since = new Date(now - 13 * 24 * HOUR).toISOString();
  // Reconcile retained evidence even when GitHub replaces a pending consumer run.
  const recent = Object.values(workflows).flatMap((id) =>
    pages(
      endpoint(
        `actions/workflows/${id}/runs?status=completed&created=%3E%3D${encodeURIComponent(since)}&per_page=100`,
      ),
      'workflow_runs',
    ),
  );
  const policy = policyDigest();
  const initial = readState();
  const updates = {},
    observations = [];
  let processed = 0;
  const trigger =
    process.env.GITHUB_EVENT_NAME === 'workflow_run'
      ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).workflow_run
      : undefined;
  for (const { id, attempt, key, startedAt } of pendingAttempts(
    recent,
    initial.runs,
    policy,
    now,
    trigger,
  )) {
    processed++;
    try {
      const run = api(endpoint(`actions/runs/${id}/attempts/${attempt}`));
      observations.push(...observeRun(run, workflows, temp));
      updates[key] = { result: 'observed', startedAt };
    } catch (error) {
      updates[key] = settle(error, initial.runs[key], { policy, startedAt, now });
      console.log(
        `::warning title=Flake evidence ${updates[key].result}::Run ${key}: ${updates[key].reason}`,
      );
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
        runs: nextRuns(state.runs, updates, now),
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
