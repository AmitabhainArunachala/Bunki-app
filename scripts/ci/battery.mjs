/** Deterministic scheduling and fail-closed admission around the canonical runner. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  lstatSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { batteryGates, runGates, verifyArtifact } from '../verify-release-gates.mjs';
import { supplementalGates } from './supplemental.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const NOW = () => new Date().toISOString();
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
};
export const digest = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const equal = (a, b, message) => assert.deepEqual(a, b, message);
const names = (rows) => rows.map((row) => (typeof row === 'string' ? row : row.name));
const unique = (rows, message) => assert.equal(new Set(names(rows)).size, rows.length, message);
const exact = (a, b, message) => {
  unique(a, message);
  unique(b, message);
  equal([...names(a)].sort(), [...names(b)].sort(), message);
};
const FAST = new Set([
  'format-check',
  'lint',
  'corridor-lint',
  'typecheck',
  'vitest',
  'reference-core',
  'reference-data',
  'reference-ui-contracts',
  'skip-core',
  'skip-ui-contracts',
  'kanji-capture',
  'navigation-returns',
  'teacher-context-contract',
  'teacher-drafts-contract',
  'sentence-drafts-contract',
  'source-inbox-contract',
  'source-processing-contract',
  'reading-position-contract',
  'browser-audio-silence-contract',
  'source-kanji-practice-contract',
  'later-encounters-contracts',
  'bundled-listening-catalog',
  'guided-session-contract',
  'replay',
  'export',
  'runtime-syntax',
  'ci-contracts',
  'deck-frozen-build',
  'deck-gloss-ja',
  'deck-export-mcd',
]);
const DECKS = new Set(['deck-frozen-build', 'deck-gloss-ja', 'deck-export-mcd']);
export function policyDigest() {
  const files = git(
    'ls-files',
    '--',
    '.github/workflows',
    'scripts/ci',
    'scripts/verify-release-gates.mjs',
    'docs/ci/gate-timings.json',
    '.github/actions',
  )
    .split('\n')
    .filter(Boolean);
  // Include new implementation files before their first commit as well.
  const walk = (dir) => {
    if (!existsSync(join(ROOT, dir))) return;
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (/\.(mjs|json|ya?ml|sh|py|txt)$/.test(file)) files.push(file);
    }
  };
  for (const dir of ['scripts/ci', '.github/workflows', '.github/actions']) walk(dir);
  return digest(
    [...new Set(files)]
      .sort()
      .filter((file) => existsSync(join(ROOT, file)))
      .map((file) => [file, digest(readFileSync(join(ROOT, file)))]),
  );
}
export function classifyPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return 'full';
  return paths.every(
    (file) =>
      typeof file === 'string' &&
      /^(?:README(?:\.[^/]+)?\.md|(?:docs\/(?:operator|vision|research|design)|notes)\/[^\n]*\.(?:md|txt))$/.test(
        file,
      ) &&
      !/(?:build-evidence|fixtures|ci\/|srs\/)/.test(file),
  )
    ? 'docs'
    : 'full';
}
export function candidateIdentity(env = process.env) {
  return {
    repository: env.GITHUB_REPOSITORY || 'AmitabhainArunachala/Bunki-app',
    sha: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    runId: String(env.GITHUB_RUN_ID || 'local'),
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT || 1),
    policyDigest: policyDigest(),
  };
}
export function createPlan({
  scope = 'full',
  identity = candidateIdentity(),
  gates = batteryGates('/unused', {}),
  supplemental = supplementalGates('/unused'),
  timings = read(join(ROOT, 'docs/ci/gate-timings.json')),
} = {}) {
  assert(['full', 'docs'].includes(scope));
  unique(gates, 'Duplicate canonical gate');
  unique([...gates, ...supplemental], 'Supplemental gate collision');
  const weights = new Map(timings.gates.map((g) => [g.name, g.maxSeconds]));
  const weight = (name) => {
    const value = weights.get(name);
    return Number.isFinite(value) && value > 0 ? value : DECKS.has(name) ? 120 : 180;
  };
  const all = [...gates, ...supplemental];
  const shards = [];
  const add = (id, kind, items) =>
    shards.push({
      id,
      kind,
      gates: items.map((g) => g.name),
      predictedSeconds: items.reduce((sum, g) => sum + weight(g.name), 0),
      browsers:
        kind === 'fast' && !items.some((g) => g.name === 'vitest')
          ? []
          : id === 'practice-history'
            ? ['chromium']
            : id === 'practice-history-webkit'
              ? ['webkit']
              : ['chromium', 'webkit'],
      e2e: items.some((g) => g.name === 'e2e'),
      corpus: items.some((g) => g.name === 'corpus-pytest'),
      python: items.some(
        (g) => DECKS.has(g.name) || ['corpus-pytest', 'reading-facets', 'vitest'].includes(g.name),
      ),
    });
  const fast = all.filter((g) => FAST.has(g.name) && !DECKS.has(g.name));
  // Early lanes: frozen deck checks retain their order, while lightweight
  // contracts are balanced into <=4 minute predicted execution bins.
  let bins = [[]],
    loads = [0];
  for (const g of fast.sort(
    (a, b) => weight(b.name) - weight(a.name) || a.name.localeCompare(b.name),
  )) {
    let i = loads.indexOf(Math.min(...loads));
    if (loads[i] + weight(g.name) > 240) {
      i = bins.length;
      bins.push([]);
      loads.push(0);
    }
    bins[i].push(g);
    loads[i] += weight(g.name);
  }
  bins.forEach((bin, i) => add(`fast-${i + 1}`, 'fast', bin));
  add(
    'fast-decks',
    'fast',
    all.filter((g) => DECKS.has(g.name)),
  );
  if (scope === 'full') {
    for (const name of ['practice-history', 'practice-history-webkit'])
      add(
        name,
        'battery',
        all.filter((g) => g.name === name),
      );
    const rest = all.filter(
      (g) => !FAST.has(g.name) && !['practice-history', 'practice-history-webkit'].includes(g.name),
    );
    const group = rest.filter((g) => ['e2e-build', 'e2e'].includes(g.name));
    const units = rest.filter((g) => !['e2e-build', 'e2e'].includes(g.name)).map((g) => [g]);
    if (group.length)
      units.push(
        group.sort((a, b) => (a.name === 'e2e-build' ? -1 : b.name === 'e2e-build' ? 1 : 0)),
      );
    const balanced = Array.from({ length: 10 }, () => []),
      seconds = Array(10).fill(0);
    for (const unit of units.sort(
      (a, b) =>
        b.reduce((s, g) => s + weight(g.name), 0) - a.reduce((s, g) => s + weight(g.name), 0) ||
        a[0].name.localeCompare(b[0].name),
    )) {
      const i = seconds.indexOf(Math.min(...seconds));
      balanced[i].push(...unit);
      seconds[i] += unit.reduce((s, g) => s + weight(g.name), 0);
    }
    balanced.forEach((bin, i) => add(`balanced-${String(i + 1).padStart(2, '0')}`, 'battery', bin));
  }
  const plan = {
    schemaVersion: 1,
    kind: 'bunki-ci-plan',
    scope,
    identity,
    batteryNames: gates.map((g) => g.name).sort(),
    requiredNames: (scope === 'full' ? all : all.filter((g) => FAST.has(g.name)))
      .map((g) => g.name)
      .sort(),
    shards,
    requiredJobs: scope === 'full' ? ['build', 'native'] : ['build'],
  };
  plan.planDigest = digest(plan);
  validatePlan(plan, {
    canonical: gates.map((g) => g.name),
    supplemental: supplemental.map((g) => g.name),
  });
  return plan;
}
export function validatePlan(
  plan,
  {
    canonical = batteryGates('/unused', {}).map((g) => g.name),
    supplemental = supplementalGates('/unused').map((g) => g.name),
  } = {},
) {
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.kind, 'bunki-ci-plan');
  assert(['full', 'docs'].includes(plan.scope));
  const { planDigest, ...body } = plan;
  assert.equal(planDigest, digest(body), 'Plan digest mismatch');
  assert(plan.shards.length > 0);
  unique(
    plan.shards.map((s) => s.id),
    'Duplicate shard',
  );
  exact(plan.batteryNames, canonical, 'Canonical membership changed');
  const expected =
    plan.scope === 'full'
      ? [...canonical, ...supplemental]
      : [...canonical, ...supplemental].filter((n) => FAST.has(n));
  exact(plan.requiredNames, expected, 'Required membership changed');
  exact(
    plan.shards.flatMap((s) => s.gates),
    plan.requiredNames,
    'Partition must cover every required gate exactly once',
  );
  for (const s of plan.shards) {
    assert(/^[a-z][a-z0-9-]*$/.test(s.id));
    assert(s.gates.length > 0);
    assert(['fast', 'battery'].includes(s.kind));
  }
  for (const shard of plan.shards) {
    assert.equal(
      shard.kind === 'fast',
      shard.gates.every((name) => FAST.has(name)),
      'Fast gate home changed',
    );
    assert(
      shard.kind !== 'fast' || /^fast-(?:[1-9][0-9]*|decks)$/.test(shard.id),
      'Unknown fast lane',
    );
  }
  if (plan.scope === 'full') {
    for (const name of ['practice-history', 'practice-history-webkit'])
      exact(
        plan.shards.find((s) => s.id === name)?.gates || [],
        [name],
        'Dedicated history shard changed',
      );
    exact(
      plan.shards.filter((s) => s.id.startsWith('balanced-')).map((s) => s.id),
      Array.from({ length: 10 }, (_, i) => `balanced-${String(i + 1).padStart(2, '0')}`),
      'Balanced shard count changed',
    );
    const e2e = plan.shards.find((s) => s.gates.includes('e2e'));
    assert(
      e2e?.gates.includes('e2e-build') && e2e.gates.indexOf('e2e-build') < e2e.gates.indexOf('e2e'),
      'E2E requires its colocated earlier build',
    );
  }
  exact(
    plan.requiredJobs,
    plan.scope === 'full' ? ['build', 'native'] : ['build'],
    'Required job omitted',
  );
  return plan;
}
function fresh(out) {
  out = resolve(out);
  let ancestor = out;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  out = resolve(realpathSync(ancestor), relative(ancestor, out));
  const allowed = [
    join(homedir(), '.dharma'),
    ...(process.env.CI && process.env.RUNNER_TEMP ? [resolve(process.env.RUNNER_TEMP)] : []),
  ];
  const inside = (a, b) => {
    const r = relative(a, b);
    return !r.startsWith('..') && !isAbsolute(r);
  };
  assert(
    allowed.some((a) => inside(a, out)),
    'Runtime evidence belongs under ~/.dharma or RUNNER_TEMP',
  );
  assert(!inside(ROOT, out), 'Runtime evidence cannot be in checkout');
  mkdirSync(out, { recursive: true });
  assert.equal(readdirSync(out).length, 0, 'Use fresh evidence directory');
  return out;
}
export function cleanSource(allowDeckApkg = false) {
  const changes = execFileSync('git', ['status', '--porcelain', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (!changes) return;
  const rows = changes.split('\0').filter(Boolean);
  assert(
    allowDeckApkg &&
      rows.every((row) =>
        /^ M (?:prototypes\/corridor\/decks\/|decks\/kotoba-mine\/).*\.apkg$/.test(row),
      ),
    'Checkout changed outside timestamped tracked deck APKG exception',
  );
}
export function validateArtifact(artifact, identity) {
  for (const key of ['id', 'name', 'digest', 'artifactSha256', 'manifestSha256', 'producerSha'])
    assert(artifact[key], `Missing artifact ${key}`);
  assert.match(String(artifact.id), /^\d+$/);
  assert.match(artifact.digest, /^sha256:[a-f0-9]{64}$/);
  for (const key of ['artifactSha256', 'manifestSha256'])
    assert.match(artifact[key], /^[a-f0-9]{64}$/);
  assert.equal(artifact.producerSha, identity.sha, 'Artifact belongs to another candidate');
  return artifact;
}
function artifactIdentity(site, artifact) {
  for (const key of ['id', 'digest', 'artifactSha256', 'manifestSha256'])
    assert(artifact[key], `Missing artifact ${key}`);
  assert.match(artifact.digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(String(artifact.id), /^\d+$/);
  const checked = verifyArtifact(site, false);
  assert.equal(checked.sourceDirty, false, 'Artifact source must be clean');
  assert.equal(checked.artifactSha256, artifact.artifactSha256);
  assert.equal(digest(readFileSync(join(site, 'build-identity.json'))), artifact.manifestSha256);
  assert.equal(checked.gitSha, artifact.producerSha);
  return {
    artifactSha256: checked.artifactSha256,
    manifestSha256: artifact.manifestSha256,
    gitSha: checked.gitSha,
    sourceDirty: false,
    verifiedAt: checked.verifiedAt,
  };
}
export function e2eBuildIdentity() {
  const directory = join(ROOT, 'apps/app/dist');
  assert(existsSync(directory), 'Passed e2e-build artifact is missing');
  const files = [];
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = join(path, entry.name);
      assert(!lstatSync(file).isSymbolicLink(), 'E2E build cannot contain symlinks');
      if (entry.isDirectory()) walk(file);
      else {
        assert(entry.isFile());
        files.push([relative(directory, file), digest(readFileSync(file))]);
      }
    }
  };
  walk(directory);
  assert(files.length > 0);
  return { sha256: digest(files), files: files.length };
}
export async function executeShard({
  plan,
  shardId,
  site,
  artifact,
  out,
  retryPlan,
  env = process.env,
}) {
  validatePlan(plan);
  equal(plan.identity, candidateIdentity(env), 'Candidate identity changed');
  out = fresh(out);
  const shard = plan.shards.find((s) => s.id === shardId);
  assert(shard, 'Unknown shard');
  const attempt = retryPlan ? 2 : 1;
  if (retryPlan) {
    validateRetryPlan(plan, retryPlan);
    assert(
      retryPlan.shards.some((s) => s.id === shardId),
      'Unplanned retry shard',
    );
  }
  const retryShard = retryPlan?.shards.find((s) => s.id === shardId);
  const requested = retryShard ? retryShard.gates : shard.gates;
  const record = {
    schemaVersion: 1,
    kind: 'bunki-ci-shard',
    status: 'running',
    identity: plan.identity,
    planDigest: plan.planDigest,
    shardId,
    attempt,
    artifact,
    jobId: String(env.CI_JOB_ID || ''),
    runner: env.RUNNER_NAME || 'local',
    startedAt: NOW(),
    completedAt: null,
    before: null,
    after: null,
    gates: [],
    dependencies: {},
    exitCode: null,
  };
  const persist = () => write(join(out, 'shard.json'), record);
  persist();
  try {
    cleanSource(false);
    if (retryShard?.dependencies?.e2eBuild) {
      equal(
        e2eBuildIdentity(),
        retryShard.dependencies.e2eBuild,
        'Restored E2E build digest differs',
      );
      record.dependencies = retryShard.dependencies;
    }
    record.before = artifactIdentity(site, artifact);
    persist();
    const artifactEnv = {
      KAIRO_SITE_DIR: resolve(site),
      KAIRO_VERIFIED_ARTIFACT_SHA256: artifact.artifactSha256,
      KAIRO_ARTIFACT_SHA256: artifact.artifactSha256,
    };
    const descriptors = [
      ...batteryGates(out, { ...env, ...artifactEnv }),
      ...supplementalGates(out),
    ];
    const selected = requested.map((name) => {
      const gate = descriptors.find((g) => g.name === name);
      assert(gate, 'Unknown gate');
      return {
        ...gate,
        timeoutMs: Math.max(gate.timeoutMs || 0, 40 * 60 * 1000),
        env: { ...gate.env, ...artifactEnv },
      };
    });
    for (const gate of selected) mkdirSync(gate.env.KAIRO_EVIDENCE_DIR, { recursive: true });
    const battery = await runGates({
      gates: selected,
      root: ROOT,
      out,
      source: {
        sha: plan.identity.sha,
        dirty: false,
        site: resolve(site),
        artifactSha256: artifact.artifactSha256,
      },
    });
    record.gates = battery.gates;
    record.exitCode = battery.exitCode;
    if (battery.gates.some((g) => g.name === 'e2e-build' && g.status === 'passed'))
      record.dependencies.e2eBuild = e2eBuildIdentity();
    if (retryShard?.dependencies?.e2eBuild)
      equal(e2eBuildIdentity(), retryShard.dependencies.e2eBuild, 'E2E build changed during retry');
    cleanSource(shard.gates.includes('deck-frozen-build'));
    record.after = artifactIdentity(site, artifact);
    record.status = battery.status;
    record.completedAt = NOW();
    persist();
    return record;
  } catch (error) {
    record.status = 'infrastructure-failed';
    record.exitCode = 1;
    record.error = error.message;
    record.completedAt = NOW();
    persist();
    throw error;
  }
}
const terminal = new Set(['passed', 'failed', 'missing', 'timed-out', 'incomplete']);
function admitReceipt(plan, receipt, shard, attempt, artifact, expected = shard.gates) {
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.kind, 'bunki-ci-shard');
  equal(receipt.identity, plan.identity, 'Receipt provenance mismatch');
  assert.equal(receipt.planDigest, plan.planDigest);
  assert.equal(receipt.shardId, shard.id);
  assert.equal(receipt.attempt, attempt);
  equal(receipt.artifact, artifact, 'Artifact provenance mismatch');
  assert(['passed', 'failed'].includes(receipt.status), 'Shard did not complete');
  assert(Number.isInteger(receipt.exitCode));
  assert.equal(receipt.exitCode, receipt.status === 'passed' ? 0 : 1);
  assert(receipt.completedAt && Date.parse(receipt.completedAt) >= Date.parse(receipt.startedAt));
  assert(receipt.jobId && receipt.runner, 'Runner/job identity missing');
  for (const boundary of ['before', 'after']) {
    const proof = receipt[boundary];
    assert(proof, 'Artifact boundary verification missing');
    assert.equal(proof.artifactSha256, artifact.artifactSha256);
    assert.equal(proof.manifestSha256, artifact.manifestSha256);
    assert.equal(proof.gitSha, plan.identity.sha);
    assert.equal(proof.sourceDirty, false);
    assert(proof.verifiedAt);
  }
  exact(receipt.gates, expected, 'Shard gate membership mismatch');
  for (const gate of receipt.gates) {
    assert(terminal.has(gate.status), 'Gate incomplete or interrupted');
    assert(Number.isInteger(gate.exitCode));
    assert.equal(gate.status === 'passed', gate.exitCode === 0);
    assert(gate.completedAt && Date.parse(gate.completedAt) >= Date.parse(gate.startedAt));
    assert(gate.log, 'Gate log missing');
  }
  assert.equal(
    receipt.status === 'passed',
    receipt.gates.every((g) => g.status === 'passed'),
    'Shard result contradicts gates',
  );
  return receipt;
}
export function createRetryPlan(plan, receipts, artifact, jobs) {
  if (jobs) jobs = normalizeJobs(jobs);
  validatePlan(plan);
  validateArtifact(artifact, plan.identity);
  assert.equal(receipts.length, plan.shards.length, 'Missing or extra first-attempt shard');
  unique(
    receipts.map((r) => r.shardId),
    'Duplicate first-attempt shard',
  );
  const shards = [];
  for (const shard of plan.shards) {
    const row = receipts.find((r) => r.shardId === shard.id);
    assert(row, 'Missing first-attempt shard');
    admitReceipt(plan, row, shard, 1, artifact);
    if (jobs) requireJob(jobs, `battery / ${shard.id}`, plan.identity, row);
    const failed = row.gates.filter((g) => g.status !== 'passed').map((g) => g.name);
    if (failed.length) {
      const retryShard = { ...shard, gates: failed };
      if (failed.includes('e2e') && !failed.includes('e2e-build')) {
        assert.match(
          row.dependencies?.e2eBuild?.sha256 || '',
          /^[a-f0-9]{64}$/,
          'E2E retry requires the passed build digest',
        );
        retryShard.dependencies = { e2eBuild: row.dependencies.e2eBuild };
      }
      shards.push(retryShard);
    }
  }
  const retry = {
    schemaVersion: 1,
    kind: 'bunki-ci-retry-plan',
    identity: plan.identity,
    planDigest: plan.planDigest,
    artifact,
    shards,
  };
  retry.retryDigest = digest(retry);
  return retry;
}
export function validateRetryPlan(plan, retry) {
  assert.equal(retry.schemaVersion, 1);
  assert.equal(retry.kind, 'bunki-ci-retry-plan');
  equal(retry.identity, plan.identity);
  assert.equal(retry.planDigest, plan.planDigest);
  const { retryDigest, ...body } = retry;
  assert.equal(retryDigest, digest(body));
  unique(
    retry.shards.map((s) => s.id),
    'Duplicate retry shard',
  );
  for (const s of retry.shards) {
    const original = plan.shards.find((row) => row.id === s.id);
    assert(original);
    assert(s.gates.length > 0);
    unique(s.gates);
    assert(s.gates.every((g) => original.gates.includes(g)));
  }
  return retry;
}
function requireJob(jobs, name, identity, receipt, allowFailure = false) {
  const matches = jobs.filter((job) => job.name === name);
  assert.equal(matches.length, 1, `Missing/duplicate job: ${name}`);
  const job = matches[0];
  assert.equal(job.status, 'completed', `Job unfinished: ${name}`);
  assert(
    allowFailure ? ['success', 'failure'].includes(job.conclusion) : job.conclusion === 'success',
    `Job failed/cancelled/skipped: ${name}`,
  );
  assert(job.started_at && job.completed_at);
  assert.equal(String(job.run_id), identity.runId, 'Wrong job run');
  assert.equal(Number(job.run_attempt), identity.runAttempt, 'Wrong job attempt');
  if (receipt) assert.equal(String(job.id), receipt.jobId, `Wrong job identity: ${name}`);
  return job;
}
export function normalizeJobs(jobs) {
  return jobs.map((job) => ({
    ...job,
    name: job.name.replace(/^(?:verify|full-battery) \/ /, ''),
  }));
}
export function aggregate({ plan, receipts, retryPlan, jobs, artifact }) {
  validatePlan(plan);
  assert(Array.isArray(jobs), 'Independent GitHub jobs metadata required');
  assert(Array.isArray(receipts) && receipts.length > 0, 'Shard receipts missing');
  jobs = normalizeJobs(jobs);
  const first = receipts.filter((r) => r.attempt === 1),
    second = receipts.filter((r) => r.attempt === 2);
  assert.equal(first.length + second.length, receipts.length, 'Unknown attempt');
  const expectedRetry = createRetryPlan(plan, first, artifact, jobs);
  validateRetryPlan(plan, retryPlan);
  equal(retryPlan, expectedRetry, 'Retry membership is not exactly first-attempt failures');
  assert.equal(second.length, retryPlan.shards.length, 'Missing/extra retries');
  unique(
    second.map((r) => r.shardId),
    'Duplicate retry shard',
  );
  for (const name of plan.requiredJobs) requireJob(jobs, name, plan.identity);
  const rows = [],
    flakes = [],
    expectedJobs = [...plan.requiredJobs];
  for (const shard of plan.shards) {
    const one = first.find((r) => r.shardId === shard.id);
    const jobName = `battery / ${shard.id}`;
    requireJob(jobs, jobName, plan.identity, one);
    expectedJobs.push(jobName);
    const retryShard = retryPlan.shards.find((s) => s.id === shard.id);
    let two;
    if (retryShard) {
      two = second.find((r) => r.shardId === shard.id);
      assert(two);
      admitReceipt(plan, two, shard, 2, artifact, retryShard.gates);
      if (retryShard.dependencies)
        equal(two.dependencies, retryShard.dependencies, 'Retry dependency identity changed');
      assert.notEqual(one.jobId, two.jobId, 'Retry requires a new job');
      assert.notEqual(one.runner, two.runner, 'Retry requires a fresh runner');
      requireJob(jobs, `retry / ${shard.id}`, plan.identity, two);
      expectedJobs.push(`retry / ${shard.id}`);
    }
    for (const original of one.gates) {
      const retry = two?.gates.find((g) => g.name === original.name);
      const status =
        original.status === 'passed' ? 'passed' : retry?.status === 'passed' ? 'flaky' : 'failed';
      const row = {
        name: original.name,
        shard: shard.id,
        status,
        seconds: (Date.parse(original.completedAt) - Date.parse(original.startedAt)) / 1000,
        retrySeconds: retry
          ? (Date.parse(retry.completedAt) - Date.parse(retry.startedAt)) / 1000
          : null,
        attempts: [
          { ...original, jobId: one.jobId, runner: one.runner },
          ...(retry ? [{ ...retry, jobId: two.jobId, runner: two.runner }] : []),
        ],
      };
      rows.push(row);
      if (status === 'flaky')
        flakes.push({
          schemaVersion: 1,
          source: 'observed-ci',
          gate: row.name,
          sha: plan.identity.sha,
          runId: plan.identity.runId,
          runAttempt: plan.identity.runAttempt,
          runner: two.runner,
          firstRunner: one.runner,
          durations: [row.seconds, row.retrySeconds],
          jobIds: [one.jobId, two.jobId],
          attempts: [1, 2],
          statuses: [original.status, retry.status],
          evidence: [one.jobId, two.jobId].map(
            (id) =>
              `https://github.com/${plan.identity.repository}/actions/runs/${plan.identity.runId}/job/${id}`,
          ),
        });
    }
  }
  exact(rows, plan.requiredNames, 'Aggregate membership mismatch');
  const failed = rows.filter((row) => row.status === 'failed');
  assert.equal(failed.length, 0, `Failed twice: ${failed.map((r) => r.name).join(', ')}`);
  const completedAt = NOW();
  const startedMs = Math.min(
    ...jobs.filter((j) => expectedJobs.includes(j.name)).map((j) => Date.parse(j.started_at)),
  );
  return {
    schemaVersion: 1,
    kind: plan.scope === 'full' ? 'bunki-full-battery' : 'bunki-docs-check',
    scope: plan.scope,
    status: 'passed',
    identity: plan.identity,
    planDigest: plan.planDigest,
    artifact,
    requiredNames: plan.requiredNames,
    expectedJobs,
    shards: plan.shards.map((s) => ({ id: s.id, gates: s.gates })),
    gates: rows,
    flakes,
    startedAt: new Date(startedMs).toISOString(),
    wallSeconds: (Date.parse(completedAt) - startedMs) / 1000,
    completedAt,
  };
}
export function summary(receipt) {
  const safe = (x) =>
    String(x ?? '')
      .replaceAll('|', '/')
      .replaceAll('\n', ' ');
  const lines = [
    `# Bunki CI — ${receipt.status} (${receipt.scope})`,
    '',
    `Candidate: ${receipt.identity.sha}; run ${receipt.identity.runId}, attempt ${receipt.identity.runAttempt}`,
    '',
    '| gate | shard | seconds | result | retry seconds | evidence |',
    '| --- | --- | ---: | --- | ---: | --- |',
  ];
  for (const row of receipt.gates)
    lines.push(
      `| ${safe(row.name)} | ${safe(row.shard)} | ${row.seconds.toFixed(2)} | ${row.status.toUpperCase()} | ${row.retrySeconds?.toFixed(2) || '—'} | [job](https://github.com/${receipt.identity.repository}/actions/runs/${receipt.identity.runId}/job/${row.attempts.at(-1).jobId}) |`,
    );
  lines.push(
    '',
    `Wall time through aggregate admission (setup and transfers included): ${receipt.wallSeconds?.toFixed(2) || 'unavailable'} seconds. Total gate execution: ${receipt.gates.reduce((s, g) => s + g.seconds + (g.retrySeconds || 0), 0).toFixed(2)} seconds. Flaky gates: ${receipt.flakes.length}.`,
    '',
    'Slowest ten:',
  );
  for (const row of [...receipt.gates].sort((a, b) => b.seconds - a.seconds).slice(0, 10))
    lines.push(`- ${row.name}: ${row.seconds.toFixed(2)}s (${row.shard})`);
  return lines.join('\n') + '\n';
}
export function failureSummary({ plan, receipts = [], jobs = [], error }) {
  const safe = (value) =>
    String(value ?? '')
      .replaceAll('|', '/')
      .replaceAll('\n', ' ');
  const rows = [];
  jobs = normalizeJobs(
    Array.isArray(jobs) ? jobs.filter((j) => j && typeof j.name === 'string') : [],
  );
  receipts = Array.isArray(receipts) ? receipts.filter((r) => r && Array.isArray(r.gates)) : [];
  for (const shard of plan.shards) {
    const one = receipts.find((r) => r.shardId === shard.id && r.attempt === 1),
      two = receipts.find((r) => r.shardId === shard.id && r.attempt === 2);
    const job = jobs.find((j) => j.name === `battery / ${shard.id}`);
    for (const name of shard.gates) {
      const initial = one?.gates?.find((g) => g.name === name),
        retry = two?.gates?.find((g) => g.name === name);
      const seconds = (g) =>
        g && Number.isFinite(Date.parse(g.completedAt) - Date.parse(g.startedAt))
          ? Math.max(0, (Date.parse(g.completedAt) - Date.parse(g.startedAt)) / 1000)
          : null;
      rows.push({
        name,
        shard: shard.id,
        seconds: seconds(initial),
        retrySeconds: seconds(retry),
        status: initial
          ? `reported ${initial.status}`
          : job?.conclusion === 'cancelled'
            ? 'cancelled'
            : job?.conclusion === 'skipped'
              ? 'skipped'
              : 'missing',
        jobId: two?.jobId || one?.jobId,
      });
    }
  }
  const lines = [
    '# Bunki CI — failed',
    '',
    `Admission rejected: ${safe(error.message)}`,
    '',
    'Rows below are diagnostic observations; admission failed.',
    '',
    '| gate | shard | seconds | result | retry seconds | evidence |',
    '| --- | --- | ---: | --- | ---: | --- |',
  ];
  for (const row of rows)
    lines.push(
      `| ${safe(row.name)} | ${safe(row.shard)} | ${row.seconds?.toFixed(2) || '—'} | ${safe(row.status).toUpperCase()} | ${row.retrySeconds?.toFixed(2) || '—'} | ${row.jobId ? `[job](https://github.com/${plan.identity.repository}/actions/runs/${plan.identity.runId}/job/${safe(row.jobId)})` : 'missing'} |`,
    );
  lines.push(
    '',
    `Observed total gate execution: ${rows.reduce((s, g) => s + (g.seconds || 0) + (g.retrySeconds || 0), 0).toFixed(2)} seconds.`,
    '',
    'Slowest ten observed gates:',
  );
  for (const row of rows
    .filter((r) => r.seconds !== null)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10))
    lines.push(`- ${row.name}: ${row.seconds.toFixed(2)}s (${row.shard})`);
  return lines.join('\n') + '\n';
}
export function loadReceipts(dir) {
  assert(existsSync(dir), 'Receipt directory missing');
  const rows = [];
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name === 'shard.json') rows.push(read(file));
    }
  };
  walk(dir);
  assert(rows.length, 'No shard receipts');
  return rows;
}
function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    assert(args[i].startsWith('--'));
    assert(args[i + 1] && !args[i + 1].startsWith('--'));
    result[args[i].slice(2)] = args[i + 1];
  }
  return result;
}
export async function main(args = process.argv.slice(2)) {
  const command = args.shift(),
    o = options(args);
  if (command === 'plan') {
    const scope = o.paths ? classifyPaths(read(o.paths)) : o.scope || 'full';
    const plan = createPlan({ scope });
    write(o.out, plan);
    const matrix = {
      include: plan.shards.map((s) => ({
        shard: s.id,
        kind: s.kind,
        python: s.python,
        corpus: s.corpus,
        e2e: s.e2e,
        browsers: s.browsers.join(' '),
      })),
    };
    console.log(JSON.stringify({ scope, planDigest: plan.planDigest, matrix }));
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `scope=${scope}\nmatrix=${JSON.stringify(matrix)}\nplan-digest=${plan.planDigest}\ntree=${plan.identity.tree}\nsha=${plan.identity.sha}\n`,
      );
    return;
  }
  if (command === 'run') {
    const receipt = await executeShard({
      plan: read(o.plan),
      shardId: o.shard,
      site: o.site,
      artifact: read(o.artifact),
      out: o.out,
      retryPlan: o['retry-plan'] ? read(o['retry-plan']) : undefined,
    });
    process.exitCode = receipt.exitCode;
    return;
  }
  if (command === 'retry-plan') {
    const retry = createRetryPlan(
      read(o.plan),
      loadReceipts(o.receipts).filter((r) => r.attempt === 1),
      read(o.artifact),
      read(o.jobs).jobs || read(o.jobs),
    );
    write(o.out, retry);
    const matrix = {
      include: retry.shards.map((s) => ({
        shard: s.id,
        kind: s.kind,
        python: s.python,
        corpus: s.corpus,
        e2e: s.e2e,
        browsers: s.browsers.join(' '),
      })),
    };
    console.log(JSON.stringify(matrix));
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `matrix=${JSON.stringify(matrix)}\nhas-retries=${retry.shards.length > 0}\n`,
      );
    return;
  }
  if (command === 'aggregate') {
    const out = fresh(o.out);
    try {
      const receipt = aggregate({
        plan: read(o.plan),
        receipts: loadReceipts(o.receipts),
        retryPlan: read(o['retry-plan']),
        jobs: read(o.jobs).jobs || read(o.jobs),
        artifact: read(o.artifact),
      });
      write(join(out, 'receipt.json'), receipt);
      writeFileSync(join(out, 'SUMMARY.md'), summary(receipt));
      writeFileSync(
        join(out, 'flakes.jsonl'),
        receipt.flakes.map((row) => JSON.stringify(row) + '\n').join(''),
      );
      if (process.env.GITHUB_STEP_SUMMARY)
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(receipt));
    } catch (error) {
      let receipts = [];
      let jobs = [];
      try {
        receipts = loadReceipts(o.receipts);
      } catch {
        /* Missing or invalid evidence remains a diagnostic absence. */
      }
      try {
        jobs = read(o.jobs).jobs || read(o.jobs);
      } catch {
        /* Missing or invalid evidence remains a diagnostic absence. */
      }
      let diagnosticPlan;
      try {
        diagnosticPlan = read(o.plan);
        validatePlan(diagnosticPlan);
      } catch {
        diagnosticPlan = createPlan();
      }
      const diagnostic = failureSummary({ plan: diagnosticPlan, receipts, jobs, error });
      writeFileSync(join(out, 'SUMMARY.md'), diagnostic);
      if (process.env.GITHUB_STEP_SUMMARY)
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, diagnostic);
      throw error;
    }
    return;
  }
  throw Error(`Unknown command: ${command}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
  });
