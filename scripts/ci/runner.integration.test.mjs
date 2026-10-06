/** Actual producers through the shard runner against the actual built artifact.
 * Hosted ci-contracts requires the downloaded site and its build metadata. A local
 * run needs KAIRO_SITE_DIR and BUNKI_RUNNER_ARTIFACT from a clean HEAD build. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { batteryGates } from '../verify-release-gates.mjs';
import {
  candidateIdentity,
  createPlan,
  digest,
  executeShard,
  phaseShards,
  validateArtifact,
} from './battery.mjs';

const hosted = process.env.GITHUB_ACTIONS === 'true';
const site = process.env.KAIRO_SITE_DIR;
const metadata =
  process.env.BUNKI_RUNNER_ARTIFACT ||
  (hosted && process.env.RUNNER_TEMP
    ? join(process.env.RUNNER_TEMP, 'inputs/artifact.json')
    : undefined);
const supplied = Boolean(site && metadata && existsSync(site) && existsSync(metadata));
const PRODUCERS = ['teaching-context', 'search-fallback-core'];

test(
  'shard runner leaves fresh evidence directories to the actual producers it runs',
  {
    skip:
      !hosted &&
      !supplied &&
      'No built artifact: set KAIRO_SITE_DIR and BUNKI_RUNNER_ARTIFACT to a clean HEAD build',
  },
  async () => {
    assert(supplied, 'Hosted ci-contracts requires the downloaded site and its build metadata');
    const env = { ...process.env };
    delete env.GITHUB_STEP_SUMMARY;
    const identity = candidateIdentity(env);
    const artifact = validateArtifact(JSON.parse(readFileSync(metadata, 'utf8')), identity);
    const plan = createPlan({ scope: 'full', identity });
    const phase = 'battery';
    const selected = phaseShards(plan, phase);
    const retryPlan = {
      schemaVersion: 1,
      kind: 'bunki-ci-retry-plan',
      phase,
      shardIds: selected.map((s) => s.id),
      identity,
      planDigest: plan.planDigest,
      artifact,
      shards: selected
        .filter((s) => PRODUCERS.some((name) => s.gates.includes(name)))
        .map((s) => ({ ...s, gates: s.gates.filter((name) => PRODUCERS.includes(name)) })),
      nonpromotable: 'runner-integration-fixture',
    };
    retryPlan.retryDigest = digest(retryPlan);
    assert.deepEqual(retryPlan.shards.flatMap((s) => s.gates).sort(), [...PRODUCERS].sort());
    const parent =
      process.env.CI && process.env.RUNNER_TEMP
        ? join(process.env.RUNNER_TEMP, 'ci-runner-integration')
        : join(homedir(), '.dharma/bunki_review/2026-10-06/ci/runner-integration');
    mkdirSync(parent, { recursive: true });
    const base = mkdtempSync(join(parent, 'case-'));
    try {
      for (const shard of retryPlan.shards) {
        const out = join(base, shard.id);
        const record = await executeShard({
          plan,
          shardId: shard.id,
          site,
          artifact,
          out,
          retryPlan,
          env,
        });
        const logs = record.gates
          .map(
            (g) =>
              `${g.name}: ${existsSync(g.log) ? readFileSync(g.log, 'utf8').slice(-2000) : 'no log'}`,
          )
          .join('\n');
        assert.equal(record.status, 'passed', logs);
        assert.equal(record.exitCode, 0);
        assert.equal(record.attempt, 2);
        assert.deepEqual(
          record.gates.map((g) => [g.name, g.status]),
          shard.gates.map((name) => [name, 'passed']),
          logs,
        );
        for (const boundary of [record.before, record.after]) {
          assert.equal(boundary.artifactSha256, artifact.artifactSha256);
          assert.equal(boundary.manifestSha256, artifact.manifestSha256);
          assert.equal(boundary.gitSha, identity.sha);
          assert.equal(boundary.sourceDirty, false);
        }
        for (const gate of batteryGates(realpathSync(out), env).filter((g) =>
          shard.gates.includes(g.name),
        )) {
          const report = JSON.parse(readFileSync(gate.report.path, 'utf8'));
          assert.equal(report.pass, true);
          assert.equal(report.artifactSha256, artifact.artifactSha256);
        }
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  },
);
