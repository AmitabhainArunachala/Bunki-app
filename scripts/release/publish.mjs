/** Preserve the admitted, deployed package as an append-only GitHub Release. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { ROOT, verifyRelease } from './version.mjs';

export const REPOSITORY = 'AmitabhainArunachala/Bunki-app';
export const PHONE_URL = 'https://amitabhainarunachala.github.io/Bunki-app/';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const gh = (...args) =>
  execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const endpoint = (path) => `repos/${REPOSITORY}/${path}`;

function optionalApi(path) {
  const result = spawnSync('gh', ['api', endpoint(path)], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status === 0) return JSON.parse(result.stdout);
  assert(!result.error, result.error?.message);
  if (result.status === 1 && /\(HTTP 404\)/u.test(result.stderr)) return null;
  throw new Error(`GitHub lookup failed: ${result.stderr}`);
}

function optionalRelease(tag) {
  const published = optionalApi(`releases/tags/${tag}`);
  if (published) return published;
  // The by-tag endpoint may omit unpublished drafts. Authenticated release
  // listing includes them, so interrupted uploads can resume without clobbering.
  for (let page = 1; ; page++) {
    const releases = JSON.parse(gh('api', endpoint(`releases?per_page=100&page=${page}`)));
    const matching = releases.filter((release) => release.tag_name === tag);
    assert(matching.length <= 1, 'Ambiguous draft release');
    if (matching.length) return matching[0];
    if (releases.length < 100) return null;
  }
}

/** GitHub's release reads can trail its writes by a moment: both the 1.0.0 and the 1.0.1 runs
 * failed within a second of creating their drafts, leaving them empty. Poll a read until it shows
 * the write (an existing draft, uploaded assets, the published tag); never repeat the write. */
export async function awaitRead(
  read,
  ready = Boolean,
  { attempts = 12, pause = 5000, sleep = delay } = {},
) {
  for (let attempt = 1; ; attempt++) {
    const value = read();
    if (ready(value) || attempt >= attempts) return value;
    await sleep(pause);
  }
}

export function assertEvidence({
  release,
  manifest,
  manifestSha256,
  receipt,
  tree,
  producerTree,
  policyDigest,
  requiredNames,
}) {
  assert.equal(release.channel, 'stable');
  assert.deepEqual(manifest.release, release);
  assert.equal(manifest.sourceDirty, false);
  assert.equal(manifest.buildId, `${release.version}+git.${manifest.gitSha.slice(0, 12)}`);
  assert.equal(receipt.kind, 'bunki-full-battery');
  assert.equal(receipt.scope, 'full');
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.identity.repository, REPOSITORY);
  assert.equal(receipt.identity.tree, tree);
  assert.equal(producerTree, tree);
  assert.equal(receipt.identity.sha, manifest.gitSha);
  assert.equal(receipt.artifact.producerSha, manifest.gitSha);
  assert.equal(receipt.artifact.artifactSha256, manifest.artifactSha256);
  assert.equal(receipt.artifact.manifestSha256, manifestSha256);
  assert.equal(receipt.identity.policyDigest, policyDigest);
  assert.deepEqual([...receipt.requiredNames].sort(), [...requiredNames].sort());
  assert.equal(new Set(requiredNames).size, requiredNames.length);
  assert.deepEqual(receipt.gates.map((gate) => gate.name).sort(), [...requiredNames].sort());
  assert(
    receipt.gates.every((gate) => ['passed', 'flaky'].includes(gate.status)),
    'Every required gate must have admitted evidence',
  );
}

export function assertExistingRecord(
  record,
  { version, releaseCommit, manifestSha256, artifactSha256 },
) {
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.version, version);
  assert.equal(record.tag, `v${version}`);
  assert.equal(
    record.releaseCommit,
    releaseCommit,
    'Never move a version tag to another source commit',
  );
  assert.equal(
    record.manifestSha256,
    manifestSha256,
    'Never replace a numbered release with different build bytes',
  );
  assert.equal(
    record.artifactSha256,
    artifactSha256,
    'Never reuse a version for different runtime bytes',
  );
}

export function assertAssetMatch(remote, bytes) {
  assert.equal(remote.state, 'uploaded', 'A partial upload is not a retained release asset');
  assert.equal(remote.size, bytes.length);
  assert.equal(
    remote.digest,
    `sha256:${hash(bytes)}`,
    'Existing release asset differs; refuse replacement',
  );
}

function productionIdentity() {
  assert.equal(process.env.GITHUB_REPOSITORY, REPOSITORY);
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  const releaseCommit = process.env.BUNKI_RELEASE_SHA || process.env.GITHUB_SHA;
  assert.match(releaseCommit || '', /^[a-f0-9]{40}$/u);
  assert.match(process.env.GITHUB_RUN_ID || '', /^[1-9]\d*$/u);
  return { releaseCommit, release: verifyRelease(ROOT, { stable: true }) };
}

function retainedRecord(release, directory) {
  const asset = release.assets.find((asset) => asset.name === 'release-record.json');
  assert(asset, 'Published release has no retained identity record');
  mkdirSync(directory, { recursive: true });
  gh(
    'release',
    'download',
    release.tag_name,
    '--repo',
    REPOSITORY,
    '--pattern',
    'release-record.json',
    '--dir',
    directory,
  );
  const bytes = readFileSync(join(directory, 'release-record.json'));
  assertAssetMatch(asset, bytes);
  return JSON.parse(bytes);
}

function assertTag(tag, expected, required = false) {
  let ref = optionalApi(`git/ref/tags/${tag}`);
  if (!ref) {
    assert(!required, 'Published release tag is missing');
    return;
  }
  let object = ref.object;
  for (let depth = 0; object.type === 'tag' && depth < 5; depth++) {
    assert.match(object.sha, /^[a-f0-9]{40}$/u);
    object = JSON.parse(gh('api', endpoint(`git/tags/${object.sha}`))).object;
  }
  assert.equal(object.type, 'commit');
  assert.equal(object.sha, expected, 'Version tag already points to another commit');
}

function guard(site) {
  const { releaseCommit, release } = productionIdentity();
  const bytes = readFileSync(join(site, 'build-identity.json'));
  const manifest = JSON.parse(bytes);
  assert.deepEqual(manifest.release, release);
  assert.equal(manifest.sourceDirty, false);
  const identity = {
    version: release.version,
    releaseCommit,
    manifestSha256: hash(bytes),
    artifactSha256: manifest.artifactSha256,
  };
  const tag = `v${release.version}`;
  assertTag(tag, releaseCommit);
  const remote = optionalRelease(tag);
  if (remote?.draft)
    assert.equal(remote.target_commitish, releaseCommit, 'Draft belongs to a different candidate');
  if (remote && !remote.draft) {
    const temporary = mkdtempSync(join(process.env.RUNNER_TEMP, 'bunki-existing-release-'));
    assertExistingRecord(retainedRecord(remote, temporary), identity);
    assertTag(tag, releaseCommit, true);
  }
  return { release, releaseCommit, manifest, manifestBytes: bytes, identity, remote };
}

async function verifyLive(manifestBytes, manifest) {
  let last;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await globalThis.fetch(
        `${PHONE_URL}build-identity.json?release=${manifest.release.version}&check=${Date.now()}`,
        { cache: 'no-store', signal: globalThis.AbortSignal.timeout(20000) },
      );
      assert(response.ok, `Live identity HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(
        hash(bytes),
        hash(manifestBytes),
        'The public site has not reached this exact build',
      );
      for (const path of ['corridor.js', 'sw.js']) {
        const asset = await globalThis.fetch(`${PHONE_URL}${path}?release-check=${Date.now()}`, {
          cache: 'no-store',
          signal: globalThis.AbortSignal.timeout(20000),
        });
        assert(asset.ok, `Live ${path} HTTP ${asset.status}`);
        assert.equal(
          hash(Buffer.from(await asset.arrayBuffer())),
          manifest.files.find((file) => file.path === path).sha256,
        );
      }
      return;
    } catch (error) {
      last = error;
      if (attempt < 7) await delay(5000);
    }
  }
  throw last;
}

async function publish(proofFile, out) {
  const receipt = read(proofFile);
  assert(!existsSync(out), 'Use a fresh release publishing directory');
  mkdirSync(out, { recursive: true });
  assert.match(receipt.artifact.id, /^[1-9]\d*$/u);
  assert.match(receipt.identity.runId, /^[1-9]\d*$/u);
  const site = join(out, 'site');
  execFileSync(
    process.execPath,
    [
      'scripts/ci/receipts.mjs',
      'download-site',
      '--id',
      receipt.artifact.id,
      '--run-id',
      receipt.identity.runId,
      '--digest',
      receipt.artifact.digest,
      '--temp',
      join(out, 'download'),
      '--out',
      site,
    ],
    { cwd: ROOT, stdio: 'inherit' },
  );
  const candidate = guard(site);
  const { release, releaseCommit, manifest, manifestBytes, identity } = candidate;
  assert.equal(
    git('rev-parse', 'HEAD'),
    manifest.gitSha,
    'Verify against the original admitted producer',
  );
  execFileSync(
    process.execPath,
    ['scripts/verify-release-gates.mjs', '--verify-artifact', site, '--require-clean'],
    {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, GITHUB_SHA: manifest.gitSha },
    },
  );
  const { createPlan } = await import('../ci/battery.mjs');
  const plan = createPlan();
  const tree = git('rev-parse', `${releaseCommit}^{tree}`);
  assertEvidence({
    release,
    manifest,
    manifestSha256: hash(manifestBytes),
    receipt,
    tree,
    producerTree: git('rev-parse', 'HEAD^{tree}'),
    policyDigest: plan.identity.policyDigest,
    requiredNames: plan.requiredNames,
  });
  await verifyLive(manifestBytes, manifest);
  const tag = `v${release.version}`;
  if (candidate.remote && !candidate.remote.draft) {
    console.log(`Release ${tag} already contains these exact deployed bytes; nothing replaced.`);
    return;
  }
  const archive = `bunki-${release.version}-site.tar.gz`;
  execFileSync(
    'tar',
    [
      '--sort=name',
      '--mtime=@0',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '-czf',
      join(out, archive),
      '-C',
      site,
      '.',
    ],
    { stdio: 'inherit' },
  );
  copyFileSync(join(site, 'build-identity.json'), join(out, 'build-identity.json'));
  copyFileSync(proofFile, join(out, 'ci-receipt.json'));
  const assets = {};
  for (const name of [archive, 'build-identity.json', 'ci-receipt.json'])
    assets[name] = hash(readFileSync(join(out, name)));
  const record = {
    schemaVersion: 1,
    ...identity,
    tag,
    sourceTree: tree,
    producerCommit: manifest.gitSha,
    sourceAssetSha256: manifest.sourceAssetSha256,
    learnerDataEpoch: release.learnerDataEpoch,
    rollbackCompatible: release.rollbackCompatible,
    migration: release.migration,
    scheduler: release.scheduler,
    ciRunId: receipt.identity.runId,
    ciRunAttempt: receipt.identity.runAttempt,
    pagesRunId: process.env.GITHUB_RUN_ID,
    requiredGates: receipt.requiredNames.length,
    observedFlakes: receipt.flakes.length,
    phoneUrl: PHONE_URL,
    assets,
  };
  writeFileSync(join(out, 'release-record.json'), `${JSON.stringify(record, null, 2)}\n`);
  assets['release-record.json'] = hash(readFileSync(join(out, 'release-record.json')));
  writeFileSync(
    join(out, 'SHA256SUMS'),
    Object.entries(assets)
      .map(([name, digest]) => `${digest}  ${name}\n`)
      .join(''),
  );
  const files = [...Object.keys(assets), 'SHA256SUMS'];
  const notes =
    readFileSync(join(ROOT, release.notes), 'utf8') +
    `\n## Published evidence\n\n- Phone app: ${PHONE_URL}\n- Release commit: ${releaseCommit}\n- Original tested producer: ${manifest.gitSha}\n- Runtime SHA-256: ${manifest.artifactSha256}\n- Full CI: https://github.com/${REPOSITORY}/actions/runs/${receipt.identity.runId}\n- Deployment: https://github.com/${REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}\n- ${receipt.requiredNames.length} required gates admitted; ${receipt.flakes.length} observed flake(s), retained in the attached CI receipt.\n\nThe attached archive is the exact tested runtime, with its original build identity. The publication check confirmed the live manifest and core assets.\n`;
  writeFileSync(join(out, 'notes.md'), notes);
  if (!candidate.remote)
    gh(
      'release',
      'create',
      tag,
      '--repo',
      REPOSITORY,
      '--target',
      releaseCommit,
      '--draft',
      '--title',
      `Bunki / KAIRO ${release.version}`,
      '--notes-file',
      join(out, 'notes.md'),
    );
  let remote = await awaitRead(() => optionalRelease(tag));
  assert(remote?.draft, 'Uploads may only modify an unpublished draft');
  assert.equal(remote.target_commitish, releaseCommit);
  assert.equal(
    remote.body,
    notes,
    'Existing draft notes differ; inspect instead of replacing them',
  );
  assert(
    remote.assets.every((asset) => files.includes(asset.name)),
    'Draft contains unexpected assets',
  );
  for (const name of files) {
    const prior = remote.assets.find((asset) => asset.name === name);
    if (prior) assertAssetMatch(prior, readFileSync(join(out, name)));
    else gh('release', 'upload', tag, join(out, name), '--repo', REPOSITORY);
  }
  remote = await awaitRead(
    () => optionalRelease(tag),
    (read) =>
      read?.assets.length === files.length &&
      read.assets.every((asset) => asset.state === 'uploaded'),
  );
  assert.equal(remote.assets.length, files.length);
  for (const name of files)
    assertAssetMatch(
      remote.assets.find((asset) => asset.name === name),
      readFileSync(join(out, name)),
    );
  assertTag(tag, releaseCommit);
  gh('release', 'edit', tag, '--repo', REPOSITORY, '--draft=false', '--latest');
  await awaitRead(() => optionalApi(`git/ref/tags/${tag}`));
  assertTag(tag, releaseCommit, true);
  const published = await awaitRead(
    () => optionalRelease(tag),
    (read) => read && !read.draft,
  );
  assert(published && !published.draft);
  console.log(
    JSON.stringify({
      version: release.version,
      url: published.html_url,
      immutable: published.immutable === true,
      artifactSha256: manifest.artifactSha256,
      gates: receipt.requiredNames.length,
    }),
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\nPublished [Bunki / KAIRO ${release.version}](${published.html_url}). Exact live bytes verified. GitHub immutable-release enforcement: ${published.immutable === true ? 'enabled' : 'owner setting still required'}.\n`,
    );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    const [command, ...args] = process.argv.slice(2);
    const options = {};
    assert(args.length % 2 === 0);
    for (let index = 0; index < args.length; index += 2) {
      assert(args[index].startsWith('--'));
      options[args[index].slice(2)] = args[index + 1];
    }
    if (command === 'resolve') {
      const receipt = read(options.proof);
      const { releaseCommit } = productionIdentity();
      assert.equal(receipt.status, 'passed');
      assert.equal(receipt.scope, 'full');
      assert.equal(receipt.identity.tree, git('rev-parse', `${releaseCommit}^{tree}`));
      assert.match(receipt.artifact.producerSha, /^[a-f0-9]{40}$/u);
      assert.equal(receipt.artifact.producerSha, receipt.identity.sha);
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(process.env.GITHUB_OUTPUT, `producer=${receipt.artifact.producerSha}\n`);
      console.log(`Admitted producer: ${receipt.artifact.producerSha}`);
    } else if (command === 'guard') {
      guard(resolve(options.site));
      console.log('Numbered release identity admitted before deployment');
    } else if (command === 'publish') await publish(resolve(options.proof), resolve(options.out));
    else
      throw new Error(
        'Usage: publish.mjs resolve|guard|publish --proof file --site directory --out directory',
      );
  })().catch((error) => {
    console.error(error);
    // Job logs are not always reachable; an annotation keeps the cause readable from the check run.
    if (process.env.GITHUB_ACTIONS === 'true') {
      const text = String(error?.stack || error)
        .slice(0, 900)
        .replaceAll('%', '%25')
        .replaceAll('\r', '%0D')
        .replaceAll('\n', '%0A');
      console.log(`::error title=release publication failed::${text}`);
    }
    process.exitCode = 1;
  });
}
