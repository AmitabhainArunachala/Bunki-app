import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { discoverSwiftTestReport, readSwiftTestReport } from './swift-test-report.mjs';

const packagePath = dirname(dirname(fileURLToPath(import.meta.url)));
if (process.env.CI && (!process.env.KAIRO_EVIDENCE_DIR || !process.env.RUNNER_TEMP)) {
  process.stderr.write('apple-sync-ci-evidence-directory-required\n');
  process.exit(1);
}
const out = resolveCorridorEvidence();
if (process.env.CI) {
  const within = relative(realpathSync(process.env.RUNNER_TEMP), out);
  if (!within || within.startsWith('..') || within.startsWith('/')) {
    process.stderr.write('apple-sync-evidence-outside-runner-temp\n');
    process.exit(1);
  }
}
if (readdirSync(out).length) {
  process.stderr.write('apple-sync-evidence-directory-not-fresh\n');
  process.exit(1);
}

function run(command, args, name) {
  const result = spawnSync(command, args, {
    cwd: packagePath,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  writeFileSync(join(out, `${name}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (result.status !== 0 || result.error) {
    const error = new Error();
    error.code = `${name}-failed`;
    throw error;
  }
  return result.stdout.trim();
}
function requireVerification(condition, code) {
  if (condition) return;
  const error = new Error(code);
  error.code = code;
  throw error;
}
function sources(at = packagePath) {
  return readdirSync(at, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(at, entry.name);
      if (entry.isDirectory()) return sources(path);
      requireVerification(entry.isFile(), 'unexpected-source-type');
      return [
        {
          path: relative(packagePath, path),
          sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
        },
      ];
    });
}
const receipt = {
  schemaVersion: 1,
  package: 'KairoAppleSync',
  status: 'pending',
  noNetworkFixtures: true,
  liveCloudKitCalls: false,
};
try {
  receipt.phase = 'platform';
  requireVerification(process.platform === 'darwin', 'macos-required');
  receipt.phase = 'source-identity';
  const sourceFiles = sources();
  receipt.sourceSha256 = createHash('sha256').update(JSON.stringify(sourceFiles)).digest('hex');
  receipt.sourceFiles = sourceFiles;
  receipt.phase = 'toolchain';
  const developer = run('xcode-select', ['-p'], 'developer-path');
  receipt.sdkPath = run('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], 'sdk-path');
  receipt.swiftVersion = run('swift', ['--version'], 'swift-version');
  const compiler = run('xcrun', ['--find', 'swiftc'], 'swiftc-path');
  const common = [
    '--package-path',
    packagePath,
    '--scratch-path',
    join(out, 'build'),
    '--cache-path',
    join(out, 'cache'),
    '--config-path',
    join(out, 'config'),
    '--security-path',
    join(out, 'security'),
  ];
  receipt.phase = 'canonical-fixtures';
  run(
    process.execPath,
    ['--experimental-transform-types', join(packagePath, 'tools/verify-fixtures.mjs')],
    'canonical-fixtures',
  );
  receipt.phase = 'rpc-canonical-fixtures';
  const rpcFixtures = JSON.parse(
    run(
      process.execPath,
      ['--experimental-transform-types', join(packagePath, 'tools/verify-rpc-fixtures.mjs')],
      'rpc-canonical-fixtures',
    ),
  );
  requireVerification(
    rpcFixtures.positive === 10 &&
      rpcFixtures.negative === 8 &&
      rpcFixtures.exactCanonicalBytes === true,
    'rpc-canonical-fixtures-failed',
  );
  receipt.phase = 'receipt-admission';
  run(
    process.execPath,
    ['--test', join(packagePath, 'tools/swift-test-report.test.mjs')],
    'receipt-admission',
  );
  receipt.phase = 'release-build';
  run('swift', ['build', '-c', 'release', ...common], 'release-build');
  receipt.phase = 'swift-testing-probe';
  const flags = [];
  const probeFlags = [];
  // CLT installs Swift Testing outside SwiftPM's default search path. Full
  // Xcode normally supplies it; add paths only when the framework exists.
  for (const base of [
    join(developer, 'Library/Developer'),
    join(developer, 'Platforms/MacOSX.platform/Developer'),
  ]) {
    const frameworks = join(base, 'Frameworks');
    const platformFrameworks = join(base, 'Library/Frameworks');
    const selected = [frameworks, platformFrameworks].find((path) =>
      existsSync(join(path, 'Testing.framework')),
    );
    if (!selected) continue;
    flags.push('-Xswiftc', '-F', '-Xswiftc', selected, '-Xlinker', '-rpath', '-Xlinker', selected);
    probeFlags.push('-F', selected);
    const interop = join(base, 'usr/lib');
    if (existsSync(join(interop, 'lib_TestingInterop.dylib')))
      flags.push('-Xlinker', '-rpath', '-Xlinker', interop);
    receipt.testingFramework = selected;
    break;
  }
  const plugin = join(
    dirname(dirname(compiler)),
    'lib/swift/host/plugins/testing/libTestingMacros.dylib',
  );
  if (existsSync(plugin)) probeFlags.push('-load-plugin-library', plugin);
  const probe = join(out, 'testing-probe.swift');
  writeFileSync(
    probe,
    'import Testing\n@Test func installedTestingMacro() { #expect(Bool(true)) }\n',
  );
  run(
    'swiftc',
    [
      '-typecheck',
      '-swift-version',
      '6',
      '-module-cache-path',
      join(out, 'probe-module-cache'),
      ...probeFlags,
      probe,
    ],
    'swift-testing-probe',
  );
  receipt.phase = 'swift-tests';
  run(
    'swift',
    ['test', ...common, ...flags, '--xunit-output', join(out, 'tests.xml')],
    'swift-tests',
  );
  receipt.phase = 'test-receipt';
  const report = discoverSwiftTestReport(out, { existsSync, readFileSync, join });
  receipt.testReport = report.name;
  const tests = readSwiftTestReport(report.xml, readFileSync(join(out, 'swift-tests.log'), 'utf8'));
  receipt.phase = 'source-recheck';
  requireVerification(
    JSON.stringify(sources()) === JSON.stringify(sourceFiles),
    'source-changed-during-verification',
  );
  receipt.status = 'passed';
  receipt.phase = 'complete';
  receipt.tests = { ...tests, canonicalFixtures: 7, rpcFixtures };
  receipt.limitations = [
    'no-live-account-authentication',
    'no-live-service-encryption-proof',
    'no-signed-provisioned-cloudkit-configuration-acceptance',
    'no-positive-live-change-token-fixture',
    'no-live-native-host-ui-pairing-acceptance',
    'protected-keychain-persistence-not-exercised-on-signed-host',
    'explicit-profile-candidate-transfer-is-not-cloud-discovery',
    'in-transit-replies-require-host-freshness',
    'no-ios-device-build',
    'sdk-download-allocation-precedes-admission-limits',
  ];
} catch (error) {
  receipt.status = 'failed';
  const allowed = [
    'macos-required',
    'unexpected-source-type',
    'source-changed-during-verification',
    'developer-path-failed',
    'sdk-path-failed',
    'swift-version-failed',
    'swiftc-path-failed',
    'canonical-fixtures-failed',
    'rpc-canonical-fixtures-failed',
    'receipt-admission-failed',
    'release-build-failed',
    'swift-testing-probe-failed',
    'swift-tests-failed',
    'test-receipt-incomplete',
    'test-receipt-failure',
    'test-summary-incomplete',
    'test-summary-mismatch',
  ];
  receipt.error = allowed.includes(error.code) ? error.code : 'apple-sync-verification-failed';
  process.exitCode = 1;
} finally {
  writeFileSync(join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  process.stdout.write(
    `Apple sync verification ${receipt.status}${receipt.error ? ` (${receipt.error})` : ''}: ${join(out, 'receipt.json')}\n`,
  );
}
