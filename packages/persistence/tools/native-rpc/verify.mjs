import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const candidateRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const repository = await realpath(process.env['KAIRO_RPC_REPO_ROOT'] ?? candidateRoot);
const require = createRequire(resolve(repository, 'package.json'));
const files = [
  'packages/persistence/src/replication/native-rpc-session.ts',
  'packages/persistence/test/replication/native-rpc-session.test.ts',
  'packages/persistence/test/replication/native-rpc-session.interop.ts',
  'packages/persistence/tools/native-rpc/FixtureHost.swift',
  'packages/persistence/tools/native-rpc/verify.mjs',
  'packages/persistence/tools/native-rpc/README.md',
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const contained = (root, path) => {
  const part = relative(root, path);
  return part.length > 0 && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
};
let out;
let phase = 'evidence';
let reason = 'fresh-external-output-required';
const checks = [];
const receipt = {
  format: 'kairo-native-rpc-client-verification',
  v: 1,
  status: 'failed',
  candidateRoot,
  repository,
  runtime: 'real-Swift-SDK-and-OS-pipes-with-ci-substitute-SQLite',
  liveCloudKitCalls: 0,
  liveAccountCalls: 0,
  authenticatedProductionIPC: false,
  hostAuthorization: 'explicit-synthetic-native-authorizer-and-out-of-band-fixture-grant',
  checks,
};
async function run(name, command, args, extraEnv = {}) {
  phase = name;
  reason = `${name}-failed`;
  try {
    const result = await execute(command, args, {
      cwd: candidateRoot,
      env: { ...process.env, ...extraEnv },
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
    });
    await writeFile(resolve(out, `${name}.log`), result.stdout + result.stderr);
    checks.push({ name, status: 'passed' });
    return result.stdout;
  } catch (error) {
    if (error.code === 'ENOENT') reason = `${name}-tool-unavailable`;
    else if (error.killed) reason = `${name}-timeout`;
    // No unclassified error.message/provider diagnostics enter the receipt.
    // These are local compiler/test logs for synthetic fixtures only.
    await writeFile(resolve(out, `${name}.log`), (error.stdout ?? '') + (error.stderr ?? ''));
    checks.push({ name, status: 'failed' });
    throw error;
  }
}
async function inventory(paths, root) {
  return Promise.all(
    paths.map(async (path) => {
      const bytes = await readFile(resolve(root, path));
      return { path, bytes: bytes.length, sha256: digest(bytes) };
    }),
  );
}
try {
  const raw = process.env['KAIRO_RPC_EVIDENCE_DIR'];
  if (!raw || !isAbsolute(raw)) throw new Error(reason);
  const allowed = process.env['CI'] ? process.env['RUNNER_TEMP'] : resolve(homedir(), '.dharma');
  if (!allowed) {
    reason = 'ci-runner-temp-required';
    throw new Error(reason);
  }
  const proposed = resolve(await realpath(dirname(raw)), raw.split(sep).at(-1));
  if (!contained(await realpath(allowed), proposed) || contained(repository, proposed))
    throw new Error(reason);
  await mkdir(proposed, { recursive: false }); // EEXIST is refusal, never reuse a green receipt.
  out = proposed;
  phase = 'candidate-sources';
  reason = 'candidate-source-inventory-failed';
  receipt.sources = await inventory(files, candidateRoot);
  receipt.sourceSha256 = digest(JSON.stringify(receipt.sources));

  phase = 'prerequisites';
  reason = 'macos-26-swift-6.3-sdk-required';
  if (process.platform !== 'darwin' || Number(process.versions.node.split('.')[0]) < 22)
    throw new Error(reason);
  const swift = await run('swift-version', 'xcrun', ['swiftc', '--version']);
  const version = /Apple Swift version (\d+)\.(\d+)/u.exec(swift);
  if (!version || Number(version[1]) < 6 || (Number(version[1]) === 6 && Number(version[2]) < 3)) {
    phase = 'prerequisites';
    reason = 'swift-6.3-required';
    throw new Error(reason);
  }
  receipt.swift = swift.trim();
  receipt.node = process.version;
  const sdk = (await run('sdk-path', 'xcrun', ['--sdk', 'macosx', '--show-sdk-path'])).trim();
  const sdkVersion = (
    await run('sdk-version', 'xcrun', ['--sdk', 'macosx', '--show-sdk-version'])
  ).trim();
  if (Number(sdkVersion.split('.')[0]) < 26) {
    phase = 'prerequisites';
    reason = 'macos-26-sdk-required';
    throw new Error(reason);
  }
  receipt.sdk = { path: sdk, version: sdkVersion };
  phase = 'test-runner';
  reason = 'vitest-tool-unavailable';
  const vitest = resolve(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
  if (!(await stat(vitest)).isFile()) throw new Error(reason);

  phase = 'format';
  reason = 'repository-prettier-check-failed';
  const prettier = require('prettier');
  const formatting = [];
  for (const path of files.filter((path) => /\.(?:ts|mjs|md)$/u.test(path))) {
    const config = await prettier.resolveConfig(resolve(repository, path));
    const ok = await prettier.check(await readFile(resolve(candidateRoot, path), 'utf8'), {
      ...config,
      filepath: path,
    });
    formatting.push({ path, status: ok ? 'passed' : 'failed' });
  }
  await writeFile(resolve(out, 'format.json'), JSON.stringify(formatting, null, 2) + '\n');
  if (formatting.some((row) => row.status !== 'passed')) throw new Error(reason);
  checks.push({ name: 'format', status: 'passed' });

  phase = 'lint';
  reason = 'scoped-eslint-failed';
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: repository });
  const lint = [];
  for (const path of files.filter((path) => /\.(?:ts|mjs)$/u.test(path))) {
    lint.push(
      ...(await eslint.lintText(await readFile(resolve(candidateRoot, path), 'utf8'), {
        filePath: resolve(repository, path),
      })),
    );
  }
  await writeFile(resolve(out, 'eslint.json'), JSON.stringify(lint, null, 2) + '\n');
  if (lint.some((row) => row.errorCount || row.warningCount)) throw new Error(reason);
  checks.push({ name: 'lint', status: 'passed' });

  phase = 'typecheck-configuration';
  reason = 'typecheck-configuration-failed';
  const tsconfig = {
    extends: resolve(repository, 'tsconfig.base.json'),
    compilerOptions: { types: ['node'], typeRoots: [resolve(repository, 'node_modules/@types')] },
    include: files
      .filter((path) => path.endsWith('.ts'))
      .map((path) => resolve(candidateRoot, path)),
  };
  await writeFile(resolve(out, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');
  await run('typecheck', process.execPath, [
    require.resolve('typescript/bin/tsc'),
    '--noEmit',
    '-p',
    resolve(out, 'tsconfig.json'),
  ]);

  phase = 'browser-bundle';
  reason = 'portable-browser-bundle-failed';
  const { build } = require('esbuild');
  const bundle = await build({
    absWorkingDir: candidateRoot,
    entryPoints: [files[0]],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    outfile: resolve(out, 'native-rpc-session.browser.mjs'),
    metafile: true,
    logLevel: 'silent',
  });
  await writeFile(
    resolve(out, 'browser-metafile.json'),
    JSON.stringify(bundle.metafile, null, 2) + '\n',
  );
  receipt.browserBundleSha256 = digest(
    await readFile(resolve(out, 'native-rpc-session.browser.mjs')),
  );
  checks.push({ name: 'browser-bundle', status: 'passed' });

  phase = 'native-sources';
  reason = 'native-source-inventory-failed';
  const nativeDirectory = 'packages/apple-sync/Sources/KairoAppleSync';
  const native = (await readdir(resolve(repository, nativeDirectory)))
    .filter((path) => path.endsWith('.swift'))
    .sort()
    .map((path) => `${nativeDirectory}/${path}`);
  const expectedNative = [
    'CloudKitBackend.swift',
    'CloudKitRecordCodec.swift',
    'CloudKitSaveAdmission.swift',
    'ForegroundJournalTransport.swift',
    'JournalRPCAdapter.swift',
    'JournalRPCFraming.swift',
    'JournalRPCSessionGate.swift',
    'JournalRPCTypes.swift',
    'JournalTypes.swift',
    'NativeBootstrapControl.swift',
    'NativeCloudEntitlements.swift',
    'NativeCloudSyncBootstrap.swift',
    'NativeProfileCandidate.swift',
    'NativeProfilePairing.swift',
  ].map((path) => `${nativeDirectory}/${path}`);
  if (JSON.stringify(native) !== JSON.stringify(expectedNative)) {
    phase = 'native-sources';
    reason = 'frozen-native-source-inventory-changed';
    throw new Error(reason);
  }
  receipt.nativeSources = await inventory(native, repository);
  receipt.nativeSourceSha256 = digest(JSON.stringify(receipt.nativeSources));
  const host = resolve(out, 'fixture-host');
  await run('swift-compile', 'xcrun', [
    'swiftc',
    '-swift-version',
    '6',
    '-parse-as-library',
    '-O',
    '-sdk',
    sdk,
    '-module-name',
    'KairoRPCClientFixture',
    '-module-cache-path',
    resolve(out, 'module-cache'),
    ...native.map((path) => resolve(repository, path)),
    resolve(candidateRoot, files[3]),
    '-o',
    host,
  ]);
  phase = 'native-artifact';
  reason = 'native-artifact-read-failed';
  receipt.fixtureBinarySha256 = digest(await readFile(host));

  phase = 'test-runner';
  reason = 'test-runner-configuration-failed';
  const configuration = {
    root: candidateRoot,
    cacheDir: resolve(out, 'vite-cache'),
    test: {
      include: [files[1], files[2]],
      testTimeout: 10000,
      reporters: ['json'],
      outputFile: resolve(out, 'tests.json'),
    },
  };
  await writeFile(
    resolve(out, 'vitest.config.mjs'),
    'export default ' + JSON.stringify(configuration, null, 2) + ';\n',
  );
  await run(
    'unit-and-interop',
    process.execPath,
    [vitest, 'run', '--config', resolve(out, 'vitest.config.mjs')],
    {
      KAIRO_RPC_FIXTURE_HOST: host,
      KAIRO_RPC_INTEROP_EVIDENCE: resolve(out, 'runtime'),
    },
  );
  phase = 'test-receipt';
  reason = 'complete-test-report-required';
  const report = JSON.parse(await readFile(resolve(out, 'tests.json'), 'utf8'));
  const expected = new Map([
    [resolve(candidateRoot, files[1]), 62],
    [resolve(candidateRoot, files[2]), 7],
  ]);
  if (
    report.success !== true ||
    report.numTotalTests !== 69 ||
    report.numPassedTests !== 69 ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numTodoTests !== 0 ||
    report.testResults.length !== 2
  )
    throw new Error(reason);
  const cases = [];
  for (const suite of report.testResults) {
    const count = expected.get(suite.name);
    expected.delete(suite.name);
    if (!count || suite.status !== 'passed' || suite.assertionResults.length !== count)
      throw new Error(reason);
    for (const row of suite.assertionResults) {
      if (row.status !== 'passed' || row.failureMessages.length) throw new Error(reason);
      cases.push({
        file: relative(candidateRoot, suite.name),
        name: row.fullName,
        status: row.status,
      });
    }
  }
  if (expected.size || new Set(cases.map((row) => row.name)).size !== 69) throw new Error(reason);
  receipt.cases = cases;
  receipt.caseSha256 = digest(JSON.stringify(cases));
  checks.push({ name: 'complete-test-receipt', status: 'passed', unitCases: 62, interopCases: 7 });
  phase = 'source-stability';
  reason = 'source-stability-check-failed';
  if (
    JSON.stringify(await inventory(files, candidateRoot)) !== JSON.stringify(receipt.sources) ||
    JSON.stringify(await inventory(native, repository)) !== JSON.stringify(receipt.nativeSources)
  ) {
    phase = 'source-stability';
    reason = 'source-changed-during-verification';
    throw new Error(reason);
  }
  phase = 'scratch-layout';
  reason = 'external-scratch-layout-required';
  for (const path of [resolve(out, 'runtime'), resolve(out, 'vite-cache')]) await stat(path);
  receipt.status = 'passed';
} catch {
  receipt.failure = { phase, reason };
  process.exitCode = 1;
} finally {
  if (out) await writeFile(resolve(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  process.stdout.write(
    JSON.stringify({
      status: receipt.status,
      receipt: out ? resolve(out, 'receipt.json') : null,
      ...(receipt.failure ? { failure: receipt.failure } : {}),
    }) + '\n',
  );
}
