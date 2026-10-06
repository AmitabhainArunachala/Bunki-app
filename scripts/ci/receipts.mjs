/** Admission and transport for reusable CI proof. Cached JSON is never authority. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const REPOSITORY = 'AmitabhainArunachala/Bunki-app';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const sorted = (values) => [...values].sort();
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const api = (path) =>
  JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
const endpoint = (suffix) => `repos/${REPOSITORY}/${suffix}`;
const sha = (value) => assert.match(value || '', /^[a-f0-9]{40}$/, 'Expected a Git object SHA');

export function assertArtifactMetadata(artifact, { runId, id, name, digest } = {}) {
  assert.equal(artifact.expired, false, 'Artifact expired');
  assert.equal(artifact.workflow_run?.id, Number(runId), 'Artifact belongs to another run');
  if (id !== undefined) assert.equal(artifact.id, Number(id), 'Artifact ID differs');
  if (name !== undefined) assert.equal(artifact.name, name, 'Artifact name differs');
  assert.match(artifact.digest || '', /^sha256:[a-f0-9]{64}$/, 'Artifact has no SHA256 digest');
  if (digest !== undefined)
    assert.equal(
      artifact.digest,
      digest.startsWith('sha256:') ? digest : `sha256:${digest}`,
      'Artifact digest differs',
    );
}

/** Pure admission contract, exercised with producer metadata and adversarial fixtures. */
export function admitProof({
  receipt,
  plan,
  run,
  jobs,
  proofArtifact,
  siteArtifact,
  producerTree,
  runHeadTree,
  producerParents = [],
}) {
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.kind, 'bunki-full-battery');
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.scope, 'full', 'Docs success is not full proof');
  const identity = receipt.identity;
  assert.equal(identity.repository, REPOSITORY);
  assert.equal(plan.identity.repository, REPOSITORY);
  assert.equal(run.repository?.full_name, REPOSITORY, 'Producer repository differs');
  assert.equal(run.head_repository?.full_name, REPOSITORY, 'Fork proof cannot promote');
  assert.equal(run.path, '.github/workflows/ci.yml', 'Unexpected producer workflow');
  assert(['pull_request', 'workflow_dispatch'].includes(run.event), 'Unexpected producer event');
  assert.equal(run.status, 'completed', 'Producer still running');
  assert.equal(run.conclusion, 'success', 'Producer run is not green');
  assert.equal(String(run.id), String(identity.runId));
  assert.equal(String(run.run_attempt), String(identity.runAttempt), 'Stale run attempt');
  for (const value of [identity.sha, identity.tree, plan.identity.tree, run.head_sha]) sha(value);
  assert.equal(producerTree, identity.tree, 'Receipt tree is not the producer tree');
  assert.equal(producerTree, plan.identity.tree, 'Producer tree differs from candidate');
  assert.equal(runHeadTree, producerTree, 'GitHub run head tree differs from producer');
  assert(
    identity.sha === run.head_sha || producerParents.includes(run.head_sha),
    'Producer commit is unrelated to run head',
  );
  assert.equal(identity.policyDigest, plan.identity.policyDigest, 'Verification policy changed');
  assert.deepEqual(
    sorted(receipt.requiredNames),
    sorted(plan.requiredNames),
    'Proof gate set differs',
  );
  assert.equal(
    new Set(receipt.requiredNames).size,
    receipt.requiredNames.length,
    'Duplicate required names',
  );
  assert.deepEqual(
    sorted(receipt.gates.map((gate) => gate.name)),
    sorted(plan.requiredNames),
    'Incomplete proof gate results',
  );
  assert(
    receipt.gates.every((gate) => ['passed', 'flaky'].includes(gate.status)),
    'A gate did not pass',
  );
  const topology = (shards) =>
    sorted(shards.map((shard) => `${shard.id}:${sorted(shard.gates).join(',')}`));
  assert.deepEqual(topology(receipt.shards), topology(plan.shards), 'Proof shard coverage differs');
  const required = jobs.filter((job) => job.name === 'bunki / required');
  assert.equal(required.length, 1, 'Expected one required aggregate job');
  assert.equal(required[0].conclusion, 'success', 'Required aggregate was not green');
  for (const name of ['build', 'native', ...plan.shards.map((shard) => `battery / ${shard.id}`)]) {
    const matches = jobs.filter((job) => job.name === name);
    assert.equal(matches.length, 1, `Missing or duplicate producer job: ${name}`);
    assert.equal(matches[0].conclusion, 'success', `Producer job was not green: ${name}`);
    assert.equal(String(matches[0].run_attempt), String(run.run_attempt), 'Mixed job attempts');
  }
  assert(
    jobs.every((job) => job.status === 'completed'),
    'Producer jobs still running',
  );
  assert(
    jobs.every(
      (job) => !['failure', 'cancelled', 'timed_out', 'action_required'].includes(job.conclusion),
    ),
    'Producer contains a red job',
  );
  assertArtifactMetadata(proofArtifact, { runId: run.id, name: `bunki-proof-${identity.tree}` });
  const artifact = receipt.artifact;
  assert.equal(artifact.producerSha, identity.sha);
  assert.match(artifact.artifactSha256 || '', /^[a-f0-9]{64}$/);
  assert.match(artifact.manifestSha256 || '', /^[a-f0-9]{64}$/);
  assertArtifactMetadata(siteArtifact, {
    runId: run.id,
    id: artifact.id,
    name: artifact.name,
    digest: artifact.digest,
  });
  return {
    producerSha: identity.sha,
    tree: producerTree,
    runId: run.id,
    runAttempt: run.run_attempt,
    artifact,
  };
}

function downloadArchive(artifact, directory) {
  mkdirSync(directory, { recursive: true });
  const archive = execFileSync('gh', ['api', endpoint(`actions/artifacts/${artifact.id}/zip`)], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  assert.equal(`sha256:${hash(archive)}`, artifact.digest, 'Downloaded archive digest mismatch');
  const file = join(directory, `${artifact.id}.zip`);
  writeFileSync(file, archive);
  return file;
}

function zipMember(archive, member, maxBuffer = 16 * 1024 * 1024) {
  return execFileSync(
    'python3',
    [
      '-c',
      'import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n names=z.namelist()\n assert names.count(sys.argv[2])==1, "missing or duplicate archive member"\n data=z.read(sys.argv[2]); assert len(data)<=int(sys.argv[3]); sys.stdout.buffer.write(data)',
      archive,
      member,
      String(maxBuffer),
    ],
    { maxBuffer },
  );
}

/** A tarball preserves all file bytes; extraction rejects links and path escapes first. */
export function extractSiteArchive(archive, destination) {
  assert(!existsSync(destination), 'Site destination must be fresh');
  execFileSync(
    'python3',
    [
      '-c',
      `import pathlib,shutil,sys,tarfile,zipfile
archive,destination=sys.argv[1:]
with zipfile.ZipFile(archive) as z:
 assert z.namelist()==['site.tar'], 'site artifact must contain only site.tar'
 with z.open('site.tar') as source, tarfile.open(fileobj=source,mode='r:') as t:
  members=t.getmembers()
  assert members and sum(m.size for m in members)<2_000_000_000, 'invalid site size'
  seen=set()
  for m in members:
   path=pathlib.PurePosixPath(m.name)
   assert not path.is_absolute() and '..' not in path.parts, 'unsafe tar path'
   assert m.isfile() or m.isdir(), 'links and special files forbidden'
   assert str(path) not in seen, 'duplicate tar path'
   seen.add(str(path))
  pathlib.Path(destination).mkdir(parents=True)
  for m in members:
   target=pathlib.Path(destination)/m.name
   if m.isdir(): target.mkdir(parents=True,exist_ok=True)
   else:
    target.parent.mkdir(parents=True,exist_ok=True)
    with t.extractfile(m) as src, target.open('xb') as dst: shutil.copyfileobj(src,dst)
`,
      archive,
      destination,
    ],
    { encoding: 'utf8' },
  );
}

function output(values) {
  for (const [key, value] of Object.entries(values)) {
    assert(!String(value).includes('\n'), 'Unsafe workflow output');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
  console.log(JSON.stringify(values));
}

async function lookup(plan, out) {
  assert.equal(plan.scope, 'full');
  assert.equal(plan.identity.sha, git('rev-parse', 'HEAD'));
  assert.equal(plan.identity.tree, git('rev-parse', 'HEAD^{tree}'));
  mkdirSync(out, { recursive: true });
  const name = `bunki-proof-${plan.identity.tree}`;
  const artifacts = api(endpoint(`actions/artifacts?name=${name}&per_page=100`)).artifacts;
  for (const artifact of artifacts) {
    try {
      assertArtifactMetadata(artifact, { runId: artifact.workflow_run?.id, name });
      const run = api(endpoint(`actions/runs/${artifact.workflow_run.id}`));
      // Download proof only after checking its server-side owner/workflow/result.
      assert.equal(run.repository?.full_name, REPOSITORY);
      assert.equal(run.head_repository?.full_name, REPOSITORY);
      assert.equal(run.path, '.github/workflows/ci.yml');
      assert.equal(run.status, 'completed');
      assert.equal(run.conclusion, 'success');
      const archive = downloadArchive(artifact, out);
      const receipt = JSON.parse(zipMember(archive, 'receipt.json').toString('utf8'));
      sha(receipt.identity?.sha);
      sha(run.head_sha);
      // fetch objects by validated IDs; never move a local branch or execute fetched code.
      execFileSync('git', ['fetch', '--no-tags', 'origin', receipt.identity.sha, run.head_sha], {
        cwd: ROOT,
        stdio: 'pipe',
      });
      const jobs = [];
      for (let page = 1; ; page++) {
        const batch = api(
          endpoint(
            `actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`,
          ),
        ).jobs;
        jobs.push(...batch);
        if (batch.length < 100) break;
      }
      const siteArtifact = api(endpoint(`actions/artifacts/${receipt.artifact.id}`));
      const admitted = admitProof({
        receipt,
        plan,
        run,
        jobs,
        proofArtifact: artifact,
        siteArtifact,
        producerTree: git('rev-parse', `${receipt.identity.sha}^{tree}`),
        runHeadTree: git('rev-parse', `${run.head_sha}^{tree}`),
        producerParents: git('show', '-s', '--format=%P', receipt.identity.sha).split(' '),
      });
      const siteArchive = downloadArchive(siteArtifact, out);
      const site = join(out, `site-${artifact.id}`);
      extractSiteArchive(siteArchive, site);
      assert.equal(
        hash(readFileSync(join(site, 'build-identity.json'))),
        receipt.artifact.manifestSha256,
      );
      write(join(out, 'receipt.json'), receipt);
      write(join(out, 'transfer.json'), {
        schemaVersion: 1,
        requestedSha: plan.identity.sha,
        requestedTree: plan.identity.tree,
        ...admitted,
        site,
      });
      output({
        matched: 'true',
        producer_sha: admitted.producerSha,
        site_dir: site,
        proof_run_id: run.id,
      });
      return;
    } catch (error) {
      console.log(`Proof artifact ${artifact.id} rejected: ${error.message}`);
    }
  }
  output({ matched: 'false' });
}

function verifyTransfer(file) {
  const transfer = read(file);
  sha(transfer.producerSha);
  sha(transfer.requestedSha);
  assert.equal(git('rev-parse', 'HEAD'), transfer.producerSha, 'Check out admitted producer first');
  assert.equal(git('rev-parse', 'HEAD^{tree}'), transfer.requestedTree);
  assert.equal(git('rev-parse', `${transfer.requestedSha}^{tree}`), transfer.requestedTree);
  assert.equal(
    hash(readFileSync(join(transfer.site, 'build-identity.json'))),
    transfer.artifact.manifestSha256,
  );
  const verified = JSON.parse(
    execFileSync(
      process.execPath,
      ['scripts/verify-release-gates.mjs', '--verify-artifact', transfer.site, '--require-clean'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_SHA: transfer.producerSha },
        maxBuffer: 16 * 1024 * 1024,
      },
    ),
  );
  assert.equal(verified.artifactSha256, transfer.artifact.artifactSha256);
  output({ verified: 'true', site_dir: transfer.site });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    assert(args[index].startsWith('--') && args[index + 1], 'Use named argument pairs');
    options[args[index].slice(2)] = args[index + 1];
  }
  if (command === 'lookup') {
    try {
      await lookup(read(options.plan), resolve(options.out));
    } catch (error) {
      console.log(`Proof lookup unavailable; full verification required: ${error.message}`);
      output({ matched: 'false' });
    }
  } else if (command === 'verify-transfer') verifyTransfer(options.transfer);
  else if (command === 'download-site') {
    const artifact = api(endpoint(`actions/artifacts/${options.id}`));
    assertArtifactMetadata(artifact, {
      id: options.id,
      runId: options['run-id'],
      digest: options.digest,
    });
    extractSiteArchive(downloadArchive(artifact, resolve(options.temp)), resolve(options.out));
  } else throw new Error('Usage: receipts.mjs lookup|verify-transfer|download-site --option value');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
