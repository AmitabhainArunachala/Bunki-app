#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const console = require('node:console');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { externalPath } = require('../lib/paths.cjs');
const { verifyBundledArtifact } = require('../lib/artifact.cjs');
const { stageDesktopHost } = require('./host-stage.cjs');
const { stageNativeHelper } = require('./native-helper-stage.cjs');
const { readNativeCloudConfiguration } = require('../lib/native-cloud-sync.cjs');

const desktop = path.resolve(__dirname, '..');
let output;
let createdOutput = false;

function cachedElectron(sourcePackage) {
  const packagePath = require.resolve('electron/package.json');
  const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const pinned = sourcePackage.devDependencies.electron;
  assert.match(pinned, /^\d+\.\d+\.\d+$/, 'Offline packaging requires an exact Electron version pin.');
  assert.equal(metadata.version, pinned, 'Installed Electron differs from the declared version.');
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const checksumPath = path.join(path.dirname(packagePath), 'checksums.json');
  const checksumBytes = fs.readFileSync(checksumPath);
  const fileName = `electron-v${pinned}-darwin-${process.arch}.zip`;
  const expected = JSON.parse(checksumBytes)[fileName];
  assert.match(expected, /^[a-f0-9]{64}$/, 'Pinned Electron package has no checksum for this Mac archive.');
  const cache = fs.realpathSync(path.join(os.homedir(), 'Library/Caches/electron'));
  const archives = fs.readdirSync(cache).sort().map((name) => path.join(cache, name, fileName))
    .filter((file) => fs.existsSync(file) && fs.statSync(file).isFile());
  const archive = archives.find((file) => digest(fs.readFileSync(file)) === expected);
  assert(archive, 'No local Electron archive matches the pinned package checksum; offline build cannot proceed.');
  const distribution = fs.realpathSync(archive);
  assert(distribution.startsWith(cache + path.sep), 'Cached Electron archive resolves outside its cache.');
  const verify = () => {
    assert.equal(digest(fs.readFileSync(distribution)), expected, 'Cached Electron changed during packaging.');
    assert.deepEqual(fs.readFileSync(checksumPath), checksumBytes, 'Pinned Electron checksums changed during packaging.');
  };
  return { distribution, verify, identity: { mode: 'pinned-local-electron-cache', packagePath,
    archive: distribution, archiveSha256: expected, checksumPath, checksumFileSha256: digest(checksumBytes),
    version: pinned, platform: 'darwin', architecture: process.arch,
    verification: 'Exact archive checksum from pinned installed Electron package; no network request or arbitrary executable override.' } };
}

function nativeMacIcon(site, output) {
  const source = path.join(site, 'icon-512.png');
  const iconset = path.join(output, 'Bunki.iconset');
  const icon = path.join(output, 'Bunki.icns');
  fs.mkdirSync(iconset);
  const log = fs.openSync(path.join(output, 'icon.log'), 'wx');
  const run = (command, args) => {
    const result = spawnSync(command, args, { stdio: ['ignore', log, log], timeout: 30_000 });
    assert.equal(result.status, 0, `${path.basename(command)} failed; see icon.log`);
  };
  try {
    for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
      const pixels = String(size * scale);
      run('/usr/bin/sips', ['-z', pixels, pixels, source, '--out', path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)]);
    }
    run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', icon]);
  } finally { fs.closeSync(log); }
  const bytes = fs.readFileSync(icon);
  assert.equal(bytes.subarray(0, 4).toString(), 'icns');
  assert.equal(bytes.readUInt32BE(4), bytes.length);
  return { path: icon, sourceSha256: createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
    sha256: createHash('sha256').update(bytes).digest('hex'), tools: ['/usr/bin/sips', '/usr/bin/iconutil'] };
}

async function build() {
  const args = process.argv.slice(2);
  if (args.length < 4 || args[0] !== '--site' || args[2] !== '--out' || !path.isAbsolute(args[1])) {
    throw new Error('Usage: node tools/build.cjs --site /absolute/canonical/site --out /absolute/fresh/output [--cached-electron] [--cloud-sync-config /absolute/config.json]');
  }
  let useCachedElectron = false;
  let cloudConfigFile = null;
  for (let index = 4; index < args.length; index += 1) {
    if (args[index] === '--cached-electron' && !useCachedElectron) useCachedElectron = true;
    else if (args[index] === '--cloud-sync-config' && !cloudConfigFile && path.isAbsolute(args[index + 1] || ''))
      cloudConfigFile = fs.realpathSync(args[++index]);
    else throw new Error('Invalid or repeated desktop build option');
  }
  const cloudConfigBytes = cloudConfigFile ? fs.readFileSync(cloudConfigFile) : null;
  if (cloudConfigBytes && cloudConfigBytes.length > 16384) throw new Error('Cloud sync configuration is too large');
  output = externalPath(args[3], { fresh: true });
  const site = fs.realpathSync(args[1]);
  const { verifyArtifact } = await import(pathToFileURL(path.resolve(desktop, '../../scripts/verify-release-gates.mjs')).href);
  const before = verifyArtifact(site);
  verifyBundledArtifact(site);
  if (process.platform !== 'darwin') throw new Error('The Mac QA bundle must be built on macOS with codesign.');
  assert(['arm64', 'x64'].includes(process.arch), 'Unsupported Mac architecture.');
  fs.mkdirSync(output, { recursive: true });
  createdOutput = true;
  const sourcePackage = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
  const localElectron = useCachedElectron ? cachedElectron(sourcePackage) : undefined;
  const localIcon = localElectron ? nativeMacIcon(site, output) : undefined;
  const packageConfig = sourcePackage.build;
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const staged = await stageDesktopHost({ root: path.resolve(desktop, '../..'), desktop,
    output: path.join(output, 'host-source') });
  const { hostSource, hostPaths, hostBytes } = staged;
  const nativeHelper = stageNativeHelper({ root: path.resolve(desktop, '../..'), output });
  const textHelper = stageNativeHelper({ root: path.resolve(desktop, '../..'), output, product: 'kairo-text-intake-host' });
  let nativeConfiguration = null;
  if (cloudConfigBytes) {
    fs.writeFileSync(path.join(nativeHelper.directory, 'cloud-sync-config.json'), cloudConfigBytes, { flag: 'wx' });
    const config = readNativeCloudConfiguration(output);
    nativeConfiguration = { sha256: digest(cloudConfigBytes), containerIdentifier: config.containerIdentifier,
      keychainService: config.keychainService, profileLabel: config.profileLabel };
  }
  const verifyNativeConfiguration = (directory) => {
    const destination = path.join(directory, 'cloud-sync-config.json');
    if (cloudConfigBytes) {
      assert.deepEqual(fs.readFileSync(cloudConfigFile), cloudConfigBytes, 'Native configuration changed during packaging');
      assert.deepEqual(fs.readFileSync(destination), cloudConfigBytes, 'Packaged native configuration differs');
    } else assert(!fs.existsSync(destination), 'An unconfigured build cannot acquire a native container configuration');
  };
  assert.deepEqual(staged.sourcePackage, sourcePackage, 'Desktop metadata changed before staging');
  const config = {
    ...packageConfig,
    electronVersion: sourcePackage.devDependencies.electron,
    npmRebuild: false,
    directories: { output: path.join(output, 'package') },
    extraResources: [{ from: site, to: 'site/corridor', filter: ['**/*'] },
      { from: nativeHelper.directory, to: 'native', filter: ['kairo-cloud-sync-host', 'kairo-text-intake-host', ...(cloudConfigBytes ? ['cloud-sync-config.json'] : [])] }],
    mac: { ...packageConfig.mac, target: 'dir', identity: null, icon: localIcon?.path || path.join(site, 'icon-512.png') },
    ...(localElectron ? { electronDist: localElectron.distribution } : {}),
  };
  const configPath = path.join(output, 'builder-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  const log = fs.openSync(path.join(output, 'build.log'), 'wx');
  const run = (command, argv) => {
    const result = spawnSync(command, argv, { cwd: desktop, stdio: ['ignore', log, log], timeout: 600_000,
      env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false', ELECTRON_BUILDER_CACHE: path.join(output, 'builder-cache') } });
    if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${result.error?.message || 'see build.log'}`);
  };
  let appPath;
  let host;
  try {
    run(process.execPath, [require.resolve('electron-builder/cli.js'), '--projectDir', hostSource, '--mac', '--dir', `--${process.arch}`, '--config', configPath, '--publish', 'never']);
    appPath = path.join(output, 'package', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Bunki.app');
    assert(fs.existsSync(appPath), 'The packager did not emit the requested app bundle.');
    if (localElectron) {
      const architecture = spawnSync('/usr/bin/lipo', ['-archs', path.join(appPath, 'Contents/MacOS/Bunki')], { encoding: 'utf8', timeout: 20_000 });
      assert.equal(architecture.status, 0, architecture.stderr);
      assert(architecture.stdout.trim().split(/\s+/).includes(process.arch === 'x64' ? 'x86_64' : process.arch), 'Packaged Electron lacks the requested Mac architecture.');
    }
    const archive = path.join(appPath, 'Contents/Resources/app.asar');
    const asar = await import(pathToFileURL(require.resolve('@electron/asar')).href);
    const archivedPaths = asar.listPackage(archive, {}).map((name) => name.replace(/^\//, '')).filter((name) => !asar.statFile(archive, name, false).files).sort();
    assert.deepEqual(archivedPaths, [...hostPaths, 'package.json'].sort(), 'The host archive must contain only the declared runtime.');
    staged.verifyInputs();
    staged.verifyStaged();
    for (const name of hostPaths) {
      assert.deepEqual(asar.extractFile(archive, name), hostBytes.get(name), 'Packaged host differs: ' + name);
      assert.deepEqual(fs.readFileSync(path.join(hostSource, name)), hostBytes.get(name), 'Staged host changed during packaging: ' + name);
    }
    const metadata = JSON.parse(asar.extractFile(archive, 'package.json'));
    for (const key of ['name', 'version', 'main']) assert.equal(metadata[key], sourcePackage[key], 'Packaged metadata differs: ' + key);
    host = { asarSha256: digest(fs.readFileSync(archive)), inputDirectory: hostSource,
      metadataSha256: digest(fs.readFileSync(path.join(hostSource, 'package.json'))),
      inputs: staged.inputs, nativeRpc: staged.nativeRpc,
      files: hostPaths.map((name) => ({ path: name, sha256: digest(hostBytes.get(name)) })) };
    const bundled = path.join(appPath, 'Contents/Resources/site/corridor');
    const bundledHelper = path.join(appPath, 'Contents/Resources/native/kairo-cloud-sync-host');
    assert.deepEqual(fs.readFileSync(bundledHelper), fs.readFileSync(nativeHelper.executable), 'Packaged native helper differs');
    nativeHelper.verifyInputs();
    nativeHelper.verifyStaged();
    textHelper.verifyInputs(); textHelper.verifyStaged();
    assert.deepEqual(fs.readFileSync(path.join(path.dirname(bundledHelper), 'kairo-text-intake-host')), fs.readFileSync(textHelper.executable), 'Packaged intake helper differs');
    verifyNativeConfiguration(path.dirname(bundledHelper));
    const after = verifyArtifact(bundled);
    assert.equal(after.artifactSha256, before.artifactSha256);
    verifyBundledArtifact(bundled);
    run(process.execPath, [path.join(__dirname, 'add-launch-shim.cjs'), appPath]);
    run('codesign', ['--force', '--deep', '--sign', '-', appPath]);
    run('codesign', ['--verify', '--deep', '--strict', appPath]);
    assert.equal(verifyArtifact(site).artifactSha256, before.artifactSha256);
    assert.equal(verifyArtifact(bundled).artifactSha256, before.artifactSha256);
    assert.equal(verifyBundledArtifact(bundled).artifactSha256, before.artifactSha256);
    if (localElectron) localElectron.verify();
    staged.verifyInputs();
    staged.verifyStaged();
    nativeHelper.verifyInputs();
    nativeHelper.verifyStaged();
    textHelper.verifyInputs(); textHelper.verifyStaged();
    verifyNativeConfiguration(path.join(appPath, 'Contents/Resources/native'));
  } finally {
    fs.closeSync(log);
  }
  const receipt = { status: 'passed', appPath, architecture: process.arch, artifact: before, host,
    textIntakeHelper: { ...textHelper.identity,
      packagedSha256: digest(fs.readFileSync(path.join(appPath, 'Contents/Resources/native/kairo-text-intake-host'))) },
    nativeHelper: { ...nativeHelper.identity,
      configuration: nativeConfiguration ? 'container configured; signing and account authorization remain required' : nativeHelper.identity.configuration,
      containerConfiguration: nativeConfiguration,
      packagedSha256: digest(fs.readFileSync(path.join(appPath, 'Contents/Resources/native/kairo-cloud-sync-host'))) },
    electronDistribution: localElectron?.identity || { mode: 'electron-builder-default-verified-download' },
    ...(localIcon ? { icon: localIcon } : {}),
    signature: 'ad-hoc local QA only; not Developer ID signed or notarized',
    packagedResources: 'Contents/Resources/site/corridor', sourceOverrideAllowed: false };
  fs.writeFileSync(path.join(output, 'build-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}

build().catch((error) => {
  // A failure receipt is written only into output this invocation created.
  if (createdOutput) {
    fs.writeFileSync(path.join(output, 'build-receipt.json'), JSON.stringify({ status: 'failed', error: error.message }, null, 2) + '\n');
  }
  console.error(error.message);
  process.exitCode = 1;
});
