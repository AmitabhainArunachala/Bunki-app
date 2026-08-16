/** Fail-closed topology check for the KAIRO campaign integration manifest. */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const REPO = resolve(import.meta.dirname, '..');
const MANIFEST = resolve(REPO, 'docs/build-evidence/kairo-campaign/integration-manifest.json');
const STATUSES = new Set(['active', 'integrated', 'blocked', 'superseded']);
const SHA = /^[0-9a-f]{7,40}$/u;

function fail(message) {
  throw new Error(`integration manifest: ${message}`);
}

function git(...args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string`);
  return value;
}

function requireSha(value, label) {
  const sha = requireString(value, label);
  if (!SHA.test(sha)) fail(`${label} is not a commit id: ${JSON.stringify(sha)}`);
  return sha;
}

function requireCommit(value, label) {
  const sha = requireSha(value, label);
  try {
    return git('rev-parse', '--verify', `${sha}^{commit}`);
  } catch {
    return fail(`${label} does not resolve to a local commit: ${sha}`);
  }
}

function isAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: REPO,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
if (manifest.schemaVersion !== 2) fail('schemaVersion must be 2');

const head = git('rev-parse', 'HEAD');
const branch = git('branch', '--show-current');
if (requireString(manifest.integrationBranch, 'integrationBranch') !== branch) {
  fail(
    `integrationBranch ${manifest.integrationBranch} does not match checked-out branch ${branch}`,
  );
}
const recordedHead = requireCommit(manifest.currentIntegrationSha, 'currentIntegrationSha');
if (!isAncestor(recordedHead, head)) {
  fail(`currentIntegrationSha ${recordedHead} is not reachable from HEAD ${head}`);
}
if (recordedHead !== head) {
  const pathsAfterRecordedHead = git('diff', '--name-only', `${recordedHead}..${head}`)
    .split('\n')
    .filter(Boolean);
  const nonEvidencePaths = pathsAfterRecordedHead.filter(
    (path) => !path.startsWith('docs/build-evidence/kairo-campaign/'),
  );
  if (nonEvidencePaths.length > 0) {
    fail(
      `currentIntegrationSha is stale; later product paths exist: ${nonEvidencePaths.join(', ')}`,
    );
  }
}
requireCommit(manifest.startingIntegrationSha, 'startingIntegrationSha');

if (!Array.isArray(manifest.workstreams) || manifest.workstreams.length === 0) {
  fail('workstreams must be a non-empty array');
}

const names = new Set();
let integrationOwnerCount = 0;
for (const [index, stream] of manifest.workstreams.entries()) {
  const prefix = `workstreams[${String(index)}]`;
  const name = requireString(stream.name, `${prefix}.name`);
  if (names.has(name)) fail(`duplicate workstream name ${name}`);
  names.add(name);

  const status = requireString(stream.status, `${prefix}.status`);
  if (!STATUSES.has(status)) fail(`${prefix}.status has unsupported value ${status}`);
  requireString(stream.branch, `${prefix}.branch`);
  requireCommit(stream.baseSha, `${prefix}.baseSha`);
  requireSha(stream.sourceHeadSha, `${prefix}.sourceHeadSha`);
  requireString(stream.capabilityOwner, `${prefix}.capabilityOwner`);
  requireString(stream.verificationStatus, `${prefix}.verificationStatus`);

  if (!Array.isArray(stream.dependencies)) fail(`${prefix}.dependencies must be an array`);
  if (!Array.isArray(stream.capabilities) || stream.capabilities.length === 0) {
    fail(`${prefix}.capabilities must be a non-empty array`);
  }

  if (stream.branch === manifest.integrationBranch) {
    integrationOwnerCount += 1;
    if (requireCommit(stream.sourceHeadSha, `${prefix}.sourceHeadSha`) !== recordedHead) {
      fail(`${prefix}.sourceHeadSha must track currentIntegrationSha for the integration branch`);
    }
  }

  if (status === 'integrated') {
    if (!Array.isArray(stream.integrationCommits) || stream.integrationCommits.length === 0) {
      fail(`${prefix}.integrationCommits must name the landed commits`);
    }
    for (const [commitIndex, commit] of stream.integrationCommits.entries()) {
      const resolved = requireCommit(
        commit,
        `${prefix}.integrationCommits[${String(commitIndex)}]`,
      );
      if (!isAncestor(resolved, head)) {
        fail(
          `${prefix}.integrationCommits[${String(commitIndex)}] ${resolved} is absent from HEAD`,
        );
      }
    }
  }
}

if (integrationOwnerCount !== 1) {
  fail(
    `expected exactly one integration-branch workstream, found ${String(integrationOwnerCount)}`,
  );
}

process.stdout.write(
  `integration manifest verified: ${String(manifest.workstreams.length)} workstreams at ${head}\n`,
);
