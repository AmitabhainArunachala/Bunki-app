'use strict';
/* global __filename */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Compile the actual package executable into an external build directory.
 * A bundled ad-hoc helper remains unavailable for CloudKit until provisioned;
 * shipping the executable does not bypass its entitlement preflight. */
function stageNativeHelper({ root, output, product = 'kairo-cloud-sync-host' }) {
  assert.equal(process.platform, 'darwin', 'Native Apple helper requires the Mac SDK');
  assert(['kairo-cloud-sync-host', 'kairo-text-intake-host'].includes(product), 'Unknown native product');
  const textIntake = product === 'kairo-text-intake-host';
  const packagePath = path.join(root, textIntake ? 'apps/kairo-ios' : 'packages/apple-sync');
  assert(fs.lstatSync(path.join(packagePath, 'Package.swift')).isFile(), 'Native package manifest must be a regular file');
  const walk = (directory) => fs.readdirSync(directory).sort().flatMap((name) => {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    assert(!stat.isSymbolicLink(), 'Native helper source cannot contain symlinks');
    if (stat.isDirectory()) return walk(file);
    assert(stat.isFile(), 'Native helper source must contain regular files');
    return [file];
  });
  // The text helper imports the iOS host core, whose current local package
  // dependencies are AppleSync and NativeShareCore. Capture all three.
  const packages = textIntake
    ? [packagePath, path.join(packagePath, 'NativeShareCore'), path.join(root, 'packages/apple-sync')]
    : [packagePath];
  const inputs = () => packages.flatMap(directory => [path.join(directory, 'Package.swift'), ...walk(path.join(directory, 'Sources'))])
    .map((file) => ({ path: path.relative(root, file).split(path.sep).join('/'), sha256: digest(fs.readFileSync(file)) }));
  const source = inputs();
  const verifyInputs = () => assert.deepEqual(inputs(), source, 'Native helper sources changed during packaging');
  const directory = path.join(output, 'native');
  fs.mkdirSync(directory, { recursive: true });
  const scratch = path.join(output, textIntake ? 'text-intake-build' : 'apple-sync-build');
  const logfile = path.join(output, textIntake ? 'text-intake-helper-build.log' : 'native-helper-build.log');
  const log = fs.openSync(logfile, 'wx');
  const buildEnvironment = { ...process.env, CLANG_MODULE_CACHE_PATH: path.join(scratch, 'clang-cache'),
    SWIFTPM_MODULECACHE_OVERRIDE: path.join(scratch, 'swift-cache') };
  let toolchain;
  let binary;
  try {
    const version = spawnSync('/usr/bin/xcrun', ['swift', '--version'], { encoding: 'utf8', timeout: 30000 });
    assert.equal(version.status, 0, 'Swift toolchain is unavailable');
    toolchain = version.stdout.trim();
    // The package is captured repository source. SwiftPM's nested sandbox
    // cannot initialize under the packager's outer network-denial sandbox;
    // disabling only that nested manifest sandbox retains the outer policy.
    const args = ['swift', 'build', '--disable-sandbox', '--package-path', packagePath, '--scratch-path', scratch, '--jobs', '2', '-c', 'release'];
    const result = spawnSync('/usr/bin/xcrun', [...args, '--product', product],
      { cwd: root, stdio: ['ignore', log, log], timeout: 300000, env: buildEnvironment });
    assert.equal(result.status, 0, 'Native helper build failed; see ' + path.basename(logfile));
    const binPath = spawnSync('/usr/bin/xcrun', [...args, '--show-bin-path'], { encoding: 'utf8', timeout: 30000, env: buildEnvironment });
    assert.equal(binPath.status, 0, 'Native helper binary location is unavailable');
    binary = fs.realpathSync(path.join(binPath.stdout.trim(), product));
    assert(binary.startsWith(fs.realpathSync(scratch) + path.sep), 'Native helper escaped its build directory');
  } finally { fs.closeSync(log); }
  verifyInputs();
  const executable = path.join(directory, product);
  fs.copyFileSync(binary, executable, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(executable, 0o755);
  const bytes = fs.readFileSync(executable);
  const verifyStaged = () => assert.deepEqual(fs.readFileSync(executable), bytes, 'Staged native helper changed');
  return { directory, executable, verifyInputs, verifyStaged,
    identity: { product, sha256: digest(bytes), bytes: bytes.length,
      architecture: process.arch, toolchain, source, builderSha256: digest(fs.readFileSync(__filename)),
      configuration: textIntake ? 'local Vision/PDFKit extraction; no account or CloudKit grant' : 'unconfigured; no production container or signing grant' } };
}

module.exports = { stageNativeHelper };
