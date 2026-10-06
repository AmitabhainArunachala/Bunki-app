#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyBundledArtifact } from '../prototypes/bunki-desktop/lib/artifact.cjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inside = (parent, child) => {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};
function canonical(path) {
  assert(isAbsolute(path), 'An absolute path is required.');
  let parent = resolve(path);
  while (!existsSync(parent)) parent = dirname(parent);
  return resolve(realpathSync(parent), relative(parent, resolve(path)));
}
function external(path) {
  const actual = canonical(path);
  const roots = [join(homedir(), '.dharma')];
  if (process.env.CI && process.env.RUNNER_TEMP) roots.push(process.env.RUNNER_TEMP);
  assert(!inside(realpathSync(repo), actual), 'Build output must be outside the checkout.');
  assert(
    roots.some((root) => inside(canonical(root), actual)),
    'Build output must be under ~/.dharma or CI RUNNER_TEMP.',
  );
  return actual;
}
function verified(site, expected) {
  assert.match(expected, /^[a-f0-9]{64}$/u, 'A pinned artifact SHA-256 is required.');
  const identity = verifyBundledArtifact(site);
  assert.equal(
    identity.artifactSha256,
    expected,
    'The iOS host must embed the pinned Corridor artifact.',
  );
  return { identity, manifestSHA256: digest(readFileSync(join(site, 'build-identity.json'))) };
}

try {
  if (args.length === 1 && args[0] === '--embed') {
    const env = process.env;
    const site = realpathSync(env.KAIRO_SITE_DIR || '');
    const { identity, manifestSHA256 } = verified(site, env.KAIRO_ARTIFACT_SHA256 || '');
    assert.equal(
      manifestSHA256,
      env.KAIRO_MANIFEST_SHA256,
      'The source manifest changed after build preparation.',
    );
    assert(
      env.TARGET_BUILD_DIR && env.UNLOCALIZED_RESOURCES_FOLDER_PATH,
      'Embedding must run as an Xcode build phase.',
    );
    const resources = external(
      resolve(env.TARGET_BUILD_DIR, env.UNLOCALIZED_RESOURCES_FOLDER_PATH),
    );
    assert(resources.endsWith('.app'), 'Expected an iOS application resource directory.');
    const destination = join(resources, 'site');
    const staging = join(resources, '.site-staging');
    // These are only derived app-bundle resources, never a profile or source.
    if (existsSync(staging)) rmSync(staging, { recursive: true });
    cpSync(site, staging, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
    });
    const copied = verified(staging, identity.artifactSha256);
    assert.equal(copied.manifestSHA256, manifestSHA256);
    if (existsSync(destination)) rmSync(destination, { recursive: true });
    renameSync(staging, destination);
    console.log(
      JSON.stringify({
        status: 'embedded',
        artifactSha256: identity.artifactSha256,
        files: identity.files.length,
      }),
    );
  } else {
    const options = new Map();
    for (let index = 0; index < args.length; index += 1) {
      const key = args[index];
      assert(
        [
          '--site',
          '--artifact-sha256',
          '--out',
          '--bundle-id',
          '--build-simulator',
          '--prepare',
        ].includes(key),
        `Unknown argument: ${key}`,
      );
      assert(!options.has(key), `Repeated argument: ${key}`);
      if (['--build-simulator', '--prepare'].includes(key)) options.set(key, true);
      else {
        assert(args[index + 1] && !args[index + 1].startsWith('--'), `Missing value for ${key}`);
        options.set(key, args[++index]);
      }
    }
    assert(
      options.has('--site') && options.has('--artifact-sha256') && options.has('--out'),
      'Usage: node scripts/build-ios-host.mjs --site /absolute/site --artifact-sha256 HASH --out /absolute/new/output [--prepare | --build-simulator --bundle-id YOUR_ID]',
    );
    assert(
      !(options.has('--prepare') && options.has('--build-simulator')),
      'Choose prepare or build-simulator.',
    );
    const site = canonical(options.get('--site'));
    const out = external(options.get('--out'));
    assert(!existsSync(out), 'Output exists; choose a new output directory.');
    const { identity, manifestSHA256 } = verified(site, options.get('--artifact-sha256'));
    const bundleID = options.get('--bundle-id');
    if (bundleID !== undefined)
      assert.match(
        bundleID,
        /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u,
        'Supply the intended bundle identifier.',
      );
    if (options.has('--build-simulator'))
      assert(
        bundleID,
        '--build-simulator requires your explicit --bundle-id; no signing identity is guessed.',
      );
    mkdirSync(out, { recursive: true });
    const invocation = [
      '-project',
      join(repo, 'apps/kairo-ios/Kairo.xcodeproj'),
      '-scheme',
      'Kairo',
      '-configuration',
      'Debug',
      '-destination',
      'generic/platform=iOS Simulator',
      '-derivedDataPath',
      join(out, 'DerivedData'),
      'CODE_SIGNING_ALLOWED=NO',
      `KAIRO_SITE_DIR=${site}`,
      `KAIRO_ARTIFACT_SHA256=${identity.artifactSha256}`,
      `KAIRO_MANIFEST_SHA256=${manifestSHA256}`,
      `KAIRO_NODE_BINARY=${process.execPath}`,
      ...(bundleID ? [`KAIRO_BUNDLE_IDENTIFIER=${bundleID}`] : []),
      'build',
    ];
    const receipt = {
      schemaVersion: 1,
      platform: 'iOS',
      status: 'prepared',
      site,
      artifactSha256: identity.artifactSha256,
      manifestSHA256,
      sourceDirty: identity.sourceDirty,
      origin: 'http://localhost:43187',
      bundleIdentifier: bundleID || null,
      files: identity.files.length,
      bytes: identity.files.reduce((sum, file) => sum + file.bytes, 0),
      xcodebuild: invocation,
      iosCompilation: 'not-run',
      deviceVerification: 'not-run',
      signing: 'not-configured',
    };
    writeFileSync(join(out, 'ios-host-build.json'), JSON.stringify(receipt, null, 2) + '\n');
    if (options.has('--build-simulator')) {
      try {
        const log = execFileSync('xcodebuild', invocation, {
          cwd: repo,
          encoding: 'utf8',
          timeout: 600_000,
          maxBuffer: 64 * 1024 * 1024,
        });
        writeFileSync(join(out, 'xcodebuild.log'), log);
        receipt.status = 'built';
        receipt.iosCompilation = 'simulator-passed';
      } catch (error) {
        writeFileSync(
          join(out, 'xcodebuild.log'),
          String(error.stdout || '') + String(error.stderr || ''),
        );
        receipt.status = 'build-failed';
        receipt.iosCompilation = 'failed-or-unavailable';
        writeFileSync(join(out, 'ios-host-build.json'), JSON.stringify(receipt, null, 2) + '\n');
        throw new Error(`iOS compilation did not pass. See ${join(out, 'xcodebuild.log')}`, {
          cause: error,
        });
      }
      writeFileSync(join(out, 'ios-host-build.json'), JSON.stringify(receipt, null, 2) + '\n');
    }
    console.log(JSON.stringify(receipt, null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
