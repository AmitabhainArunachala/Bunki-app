'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');
const { stageDesktopHost, NATIVE_RPC_PATH } = require('../tools/host-stage.cjs');

const root = process.env.KAIRO_HOST_STAGE_REPO || path.resolve(__dirname, '../../..');
const desktop = path.join(root, 'prototypes/bunki-desktop');
const parent = path.join(os.homedir(), '.dharma', 'bunki', 'host-stage-tests');
fs.mkdirSync(parent, { recursive: true });
const evidence = fs.mkdtempSync(path.join(parent, 'run-'));
const stage = (name, source = desktop) =>
  stageDesktopHost({ root, desktop: source, output: path.join(evidence, name) });
function copiedSource(name) {
  const out = path.join(evidence, name);
  fs.mkdirSync(out);
  fs.mkdirSync(path.join(out, 'lib'));
  for (const file of ['main.cjs', 'preload.cjs', 'package.json'])
    fs.copyFileSync(path.join(desktop, file), path.join(out, file));
  for (const file of fs.readdirSync(path.join(desktop, 'lib')).filter((x) => x.endsWith('.cjs')))
    fs.copyFileSync(path.join(desktop, 'lib', file), path.join(out, 'lib', file));
  return out;
}

let compilerFixture;
async function copiedCompiler(name) {
  if (!compilerFixture) compilerFixture = await stage('compiler-fixture-inventory');
  const out = path.join(evidence, name);
  fs.mkdirSync(out);
  for (const input of compilerFixture.inputs) {
    const relative = path.relative(root, input.file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
    const target = path.join(out, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(input.file, target);
  }
  // Include the original implicit config/resolver inputs in the fixture too,
  // so these counterexamples also reproduce against the original stager.
  for (const filename of ['tsconfig.json', 'tsconfig.base.json'])
    fs.copyFileSync(path.join(root, filename), path.join(out, filename));
  fs.mkdirSync(path.join(out, 'node_modules/@bunki'), { recursive: true });
  for (const name of fs.readdirSync(path.join(out, 'packages'))) {
    if (fs.existsSync(path.join(out, 'packages', name, 'package.json')))
      fs.symlinkSync('../../packages/' + name, path.join(out, 'node_modules/@bunki', name));
  }
  fs.symlinkSync(path.join(root, 'node_modules/esbuild'), path.join(out, 'node_modules/esbuild'));
  return out;
}

test('closed host loads the actual generated client in a fresh Node process outside the checkout', async () => {
  const result = await stage('closed');
  const metadata = JSON.parse(fs.readFileSync(path.join(result.hostSource, 'package.json')));
  assert.deepEqual(metadata.dependencies, {});
  assert.equal(metadata.main, 'main.cjs');
  assert(
    result.nativeRpc.inputs.some(
      (x) => x.path === 'packages/persistence/src/replication/native-rpc-session.ts',
    ),
  );
  assert.deepEqual(Object.values(result.nativeRpc.metafile.outputs)[0].imports, []);
  assert(result.hostPaths.includes(NATIVE_RPC_PATH));
  assert(!fs.existsSync(path.join(result.hostSource, 'node_modules')));
  const child = spawnSync(
    process.execPath,
    [
      '-e',
      "const x = require('./lib/native-rpc-session.cjs'); if (typeof x.NativeRpcSyncSession !== 'function' || typeof x.NativeRpcSessionError !== 'function') process.exit(1);",
    ],
    { cwd: result.hostSource, env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(child.status, 0, child.stderr);
  result.verifyInputs();
  result.verifyStaged();
  fs.writeFileSync(
    path.join(evidence, 'closed-receipt.json'),
    JSON.stringify(
      {
        hostSource: result.hostSource,
        inputs: result.inputs,
        nativeRpc: result.nativeRpc,
      },
      null,
      2,
    ) + '\n',
  );
});

test('repeated staging preserves exact compiled bytes and declared compiler inputs', async () => {
  const first = await stage('repeat-a');
  const second = await stage('repeat-b');
  assert.deepEqual(first.hostBytes.get(NATIVE_RPC_PATH), second.hostBytes.get(NATIVE_RPC_PATH));
  assert.deepEqual(first.nativeRpc, second.nativeRpc);
});

test('existing output is refused without overwriting retained evidence', async () => {
  const out = path.join(evidence, 'existing');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'sentinel'), 'retain');
  await assert.rejects(stageDesktopHost({ root, output: out }), /fresh directory/);
  assert.equal(fs.readFileSync(path.join(out, 'sentinel'), 'utf8'), 'retain');
});

test('generated native client cannot be replaced by an authored file', async () => {
  const source = copiedSource('source-collision');
  fs.writeFileSync(path.join(source, NATIVE_RPC_PATH), "throw Error('must not run');\n");
  await assert.rejects(stage('collision-output', source), /cannot shadow authored/);
  assert(!fs.existsSync(path.join(evidence, 'collision-output')));
});

test('source change after staging is refused while copied runtime retains its original bytes', async () => {
  const source = copiedSource('source-change');
  const result = await stage('source-change-output', source);
  fs.appendFileSync(path.join(source, 'main.cjs'), '\n// changed after snapshot\n');
  assert.throws(() => result.verifyInputs(), /Host source changed after staging/);
  result.verifyStaged();
});

test('staged native client modification cannot retain a successful identity', async () => {
  const result = await stage('tampered-module');
  fs.appendFileSync(path.join(result.hostSource, NATIVE_RPC_PATH), '\n// changed after snapshot\n');
  assert.throws(() => result.verifyStaged(), /Staged host changed/);
});

test('extra staged files and symlinks are both refused', async () => {
  const extra = await stage('extra-file');
  fs.writeFileSync(path.join(extra.hostSource, 'unexpected.cjs'), '');
  assert.throws(() => extra.verifyStaged(), /exactly its declared runtime/);
  const link = await stage('extra-link');
  fs.symlinkSync('main.cjs', path.join(link.hostSource, 'unexpected.cjs'));
  assert.throws(() => link.verifyStaged(), /cannot contain symlinks/);
});

test('rebinding an authored symlink is detected even when both target bytes agree', async () => {
  const source = copiedSource('source-link');
  fs.renameSync(path.join(source, 'main.cjs'), path.join(source, 'input-a.txt'));
  fs.copyFileSync(path.join(source, 'input-a.txt'), path.join(source, 'input-b.txt'));
  fs.symlinkSync('input-a.txt', path.join(source, 'main.cjs'));
  const result = await stage('source-link-output', source);
  fs.unlinkSync(path.join(source, 'main.cjs'));
  fs.symlinkSync('input-b.txt', path.join(source, 'main.cjs'));
  assert.throws(() => result.verifyInputs(), /Host input link changed/);
  result.verifyStaged();
});

test('a transform-changing base config mutation invalidates its captured input identity', async () => {
  const source = await copiedCompiler('compiler-config-source');
  const result = await stageDesktopHost({
    root: source,
    output: path.join(evidence, 'compiler-config-before'),
  });
  const file = path.join(source, 'tsconfig.base.json');
  const config = JSON.parse(fs.readFileSync(file));
  config.compilerOptions.useDefineForClassFields = false;
  fs.writeFileSync(file, JSON.stringify(config));
  assert.throws(() => result.verifyInputs(), /Host source changed after staging/);
  const changed = await stageDesktopHost({
    root: source,
    output: path.join(evidence, 'compiler-config-after'),
  });
  assert.notEqual(changed.nativeRpc.sha256, result.nativeRpc.sha256);
  assert.notDeepEqual(changed.nativeRpc.compiler, result.nativeRpc.compiler);
});

test('a per-workspace implicit tsconfig cannot change the explicitly configured client', async () => {
  const source = await copiedCompiler('implicit-config-source');
  const before = await stageDesktopHost({
    root: source,
    output: path.join(evidence, 'implicit-config-before'),
  });
  fs.writeFileSync(
    path.join(source, 'packages/domain/tsconfig.json'),
    JSON.stringify({ compilerOptions: { useDefineForClassFields: false } }),
  );
  before.verifyInputs();
  const after = await stageDesktopHost({
    root: source,
    output: path.join(evidence, 'implicit-config-after'),
  });
  assert.equal(after.nativeRpc.sha256, before.nativeRpc.sha256);
});

test('an ambient workspace alias cannot redirect a captured workspace export', async () => {
  const source = await copiedCompiler('workspace-alias-source');
  const alternate = path.join(source, 'alternate-sync');
  fs.cpSync(path.join(source, 'packages/sync'), alternate, { recursive: true });
  fs.appendFileSync(
    path.join(alternate, 'src/index.ts'),
    '\nglobalThis.__HOST_TEST_ALIAS_MARKER__ = "unexpected-alternate";\n',
  );
  const before = await stageDesktopHost({
    root: source,
    output: path.join(evidence, 'workspace-alias-before'),
  });
  const alias = path.join(source, 'node_modules/@bunki/sync');
  fs.unlinkSync(alias);
  fs.symlinkSync('../../alternate-sync', alias);
  before.verifyInputs();
  const after = await stageDesktopHost({
    root: source,
    output: path.join(evidence, 'workspace-alias-after'),
  });
  assert.equal(after.nativeRpc.sha256, before.nativeRpc.sha256);
  assert(!after.hostBytes.get(NATIVE_RPC_PATH).toString('utf8').includes('unexpected-alternate'));
});

test('rebinding the output parent during compilation is refused before redirected runtime writes', async () => {
  const declared = path.join(evidence, 'parent-during');
  const other = path.join(evidence, 'parent-during-other');
  fs.mkdirSync(declared);
  fs.mkdirSync(other);
  const pending = stageDesktopHost({ root, output: path.join(declared, 'runtime') });
  fs.renameSync(declared, declared + '-retained');
  fs.symlinkSync(other, declared);
  await assert.rejects(pending, /Host (directory|output parent)/);
  assert(!fs.existsSync(path.join(other, 'runtime')));
});

test('rebinding an output parent after staging invalidates even byte-identical copied runtime', async () => {
  const declared = path.join(evidence, 'parent-after');
  const result = await stageDesktopHost({ root, output: path.join(declared, 'runtime') });
  const other = path.join(evidence, 'parent-after-other');
  fs.cpSync(declared, other, { recursive: true });
  fs.renameSync(declared, declared + '-retained');
  fs.symlinkSync(other, declared);
  assert.throws(() => result.verifyStaged(), /Host (directory|output parent)/);
});

test('a relative native source alias is refused before its requested binding can disappear', async () => {
  const source = await copiedCompiler('relative-alias-source');
  const file = path.join(source, 'packages/sync/src/common.ts');
  const first = path.join(source, 'packages/sync/src/common-source-a.ts');
  const second = path.join(source, 'packages/sync/src/common-source-b.ts');
  fs.renameSync(file, first);
  fs.copyFileSync(first, second);
  fs.appendFileSync(second, '\nglobalThis.__HOST_TEST_RELATIVE_ALIAS__ = "alternate-common";\n');
  fs.symlinkSync('common-source-a.ts', file);
  const output = path.join(evidence, 'relative-alias-output');
  await assert.rejects(
    stageDesktopHost({ root: source, output }),
    /Native compiler source aliases are not supported/,
  );
  assert(!fs.existsSync(output));
});

// Exercise the actual native stager's source capture and verification while a
// bounded compiler fixture writes inert bytes. These are input-identity checks;
// the private Mac package build separately compiles the real Swift products.
function nativeHelperFixture(name, product = 'kairo-text-intake-host', duringBuild = () => {}) {
  const directory = path.join(evidence, name);
  const fixtureRoot = path.join(directory, 'source');
  const output = path.join(directory, 'output');
  const packageRoots = ['apps/kairo-ios', 'apps/kairo-ios/NativeShareCore', 'packages/apple-sync'];
  for (const relative of packageRoots) {
    const base = path.join(fixtureRoot, relative);
    fs.mkdirSync(path.join(base, 'Sources/Core'), { recursive: true });
    fs.writeFileSync(path.join(base, 'Package.swift'), `// fixture manifest: ${relative}\n`);
    fs.writeFileSync(path.join(base, 'Sources/Core/Value.swift'), `// fixture source: ${relative}\n`);
  }
  fs.mkdirSync(output);
  const sourceFile = process.env.KAIRO_NATIVE_HELPER_STAGE_SOURCE || path.join(desktop, 'tools/native-helper-stage.cjs');
  const moduleFixture = { exports: {} };
  const commands = [];
  const fakeSpawnSync = (command, args) => {
    assert.equal(command, '/usr/bin/xcrun'); commands.push(args);
    if (args.includes('--version')) return { status: 0, stdout: 'Swift compiler fixture; not a build observation' };
    assert(args.includes('build'));
    const scratch = args[args.indexOf('--scratch-path') + 1];
    const bin = path.join(scratch, 'release');
    if (args.includes('--show-bin-path')) return { status: 0, stdout: bin + '\n' };
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, product), 'inert compiler fixture bytes');
    duringBuild(fixtureRoot);
    return { status: 0 };
  };
  vm.runInNewContext(fs.readFileSync(sourceFile, 'utf8'), {
    module: moduleFixture, __filename: sourceFile,
    process: { platform: 'darwin', arch: process.arch, env: {} },
    require: (name) => name === 'node:child_process' ? { spawnSync: fakeSpawnSync } : require(name),
  }, { filename: sourceFile, timeout: 5000 });
  const result = moduleFixture.exports.stageNativeHelper({ root: fixtureRoot, output, product });
  return { result, fixtureRoot, output, commands };
}

test('native helper text product captures every declared local package including NativeShareCore', () => {
  const { result, commands } = nativeHelperFixture('native-closure');
  assert.deepEqual(Array.from(result.identity.source, (row) => row.path).sort(), [
    'apps/kairo-ios/NativeShareCore/Package.swift',
    'apps/kairo-ios/NativeShareCore/Sources/Core/Value.swift',
    'apps/kairo-ios/Package.swift',
    'apps/kairo-ios/Sources/Core/Value.swift',
    'packages/apple-sync/Package.swift',
    'packages/apple-sync/Sources/Core/Value.swift',
  ].sort());
  assert(commands.filter((args) => args.includes('build')).every((args) => args[args.indexOf('--jobs') + 1] === '2'));
  result.verifyInputs(); result.verifyStaged();
});

test('native helper rejects changed dependency source or manifest after staging', () => {
  for (const relative of ['Sources/Core/Value.swift', 'Package.swift']) {
    const { result, fixtureRoot } = nativeHelperFixture('native-changed-' + path.basename(relative));
    fs.appendFileSync(path.join(fixtureRoot, 'apps/kairo-ios/NativeShareCore', relative), '// changed\n');
    assert.throws(() => result.verifyInputs(), /Native helper sources changed/);
    result.verifyStaged();
  }
});

test('native helper rejects dependency additions and changes during compilation', () => {
  const { result, fixtureRoot } = nativeHelperFixture('native-added');
  fs.writeFileSync(path.join(fixtureRoot, 'apps/kairo-ios/NativeShareCore/Sources/Core/New.swift'), '// new\n');
  assert.throws(() => result.verifyInputs(), /Native helper sources changed/);
  assert.throws(() => nativeHelperFixture('native-during-build', 'kairo-text-intake-host', (source) => {
    fs.appendFileSync(path.join(source, 'apps/kairo-ios/NativeShareCore/Sources/Core/Value.swift'), '// changed in compiler fixture\n');
  }), /Native helper sources changed/);
});

test('native helper cloud product does not acquire an unrelated iOS dependency', () => {
  const { result, fixtureRoot } = nativeHelperFixture('native-cloud-closure', 'kairo-cloud-sync-host');
  assert.deepEqual(Array.from(result.identity.source, (row) => row.path).sort(), [
    'packages/apple-sync/Package.swift', 'packages/apple-sync/Sources/Core/Value.swift',
  ]);
  fs.appendFileSync(path.join(fixtureRoot, 'apps/kairo-ios/NativeShareCore/Sources/Core/Value.swift'), '// unrelated\n');
  result.verifyInputs();
});
