/** Truthful battery execution and behavioral regression checks for release gates. */
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { buildCorridorModules } from './build-reading-module.mjs';
import { corridorAssetFiles } from './corridor-assets.mjs';

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF), '..');
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const now = () => new Date().toISOString();
const inside = (parent, child) => {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
};
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
};

function freshOutput(path, root = ROOT) {
  const requested = resolve(path);
  let ancestor = requested;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const out = resolve(realpathSync(ancestor), relative(ancestor, requested));
  const permitted = [join(homedir(), '.dharma')];
  if (process.env.CI && process.env.RUNNER_TEMP) permitted.push(resolve(process.env.RUNNER_TEMP));
  assert(!inside(realpathSync(root), out), 'Evidence must not be written into the checkout');
  assert(
    permitted.some((base) => inside(base, out)),
    'Evidence must be under ~/.dharma or CI RUNNER_TEMP',
  );
  mkdirSync(out, { recursive: true });
  assert.equal(
    readdirSync(out).length,
    0,
    'Use a fresh output directory; stale evidence is not a new pass',
  );
  return out;
}

export function verifyArtifact(path, requireClean = false) {
  const site = resolve(path);
  const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const manifest = json(join(site, 'build-identity.json'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.product, 'KAIRO');
  assert.equal(
    manifest.gitSha,
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  );
  if (process.env.CI && process.env.GITHUB_SHA)
    assert.equal(
      manifest.gitSha,
      process.env.GITHUB_SHA,
      'Artifact is not the requested CI candidate',
    );
  assert.equal(typeof manifest.sourceDirty, 'boolean');
  if (requireClean) {
    assert.equal(manifest.sourceDirty, false, 'A dirty source build cannot publish');
    assert.equal(
      execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim(),
      '',
      'Source changed after assembly',
    );
  }
  const walk = (directory) =>
    readdirSync(directory)
      .sort()
      .flatMap((name) => {
        const file = join(directory, name);
        const stat = lstatSync(file);
        assert(!stat.isSymbolicLink(), 'The tested artifact cannot contain symlinks');
        if (stat.isDirectory()) return walk(file);
        assert(stat.isFile(), 'Unsupported artifact entry');
        return [file];
      });
  const actual = walk(site)
    .filter((file) => file !== join(site, 'build-identity.json'))
    .map((file) => {
      const bytes = readFileSync(file);
      return {
        path: relative(site, file).split(sep).join('/'),
        bytes: bytes.length,
        sha256: sha256(bytes),
      };
    });
  assert(actual.length > 0, 'The artifact is empty');
  assert(
    isDeepStrictEqual(actual, manifest.files),
    'Artifact contents differ from their assembly manifest',
  );
  assert.equal(
    sha256(JSON.stringify(actual)),
    manifest.artifactSha256,
    'Artifact digest disagrees',
  );
  const modules = buildCorridorModules(ROOT);
  const moduleByPath = new Map(modules.map((module) => [module.path, module]));
  const source = join(ROOT, 'prototypes/corridor');
  const sourceInputs = [
    ...corridorAssetFiles(source).map((file) => ({
      path: relative(source, file).split(sep).join('/'),
      sha256: sha256(readFileSync(file)),
    })),
    ...modules.map((module) => ({ path: module.path, sha256: sha256(module.bytes) })),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const actualPaths = new Set(actual.map((file) => file.path));
  const requiredPaths = new Set([...sourceInputs.map((file) => file.path), '404.html']);
  const missing = [...requiredPaths].filter((path) => !actualPaths.has(path));
  const extra = [...actualPaths].filter((path) => !requiredPaths.has(path));
  // A 23k-entry assertion diff can exhaust Node's heap on an incomplete build.
  // Compare the entire set, but keep its rejection diagnostic bounded.
  assert(
    missing.length === 0 && extra.length === 0,
    `Artifact must contain the complete runtime asset set; missing ${missing.length} (${missing.slice(0, 5).join(', ')}), unexpected ${extra.length} (${extra.slice(0, 5).join(', ')})`,
  );
  assert.equal(
    sha256(JSON.stringify(sourceInputs)),
    manifest.sourceAssetSha256,
    'Unstamped source digest disagrees',
  );
  for (const file of actual) {
    const source = join(
      ROOT,
      'prototypes/corridor',
      file.path === '404.html' ? 'index.html' : file.path,
    );
    const bytes = moduleByPath.get(file.path)?.bytes || readFileSync(source);
    const emitted =
      file.path === 'sw.js'
        ? Buffer.concat([
            Buffer.from(`self.KAIRO_ASSET_VERSION = "${manifest.sourceAssetSha256}";\n`),
            bytes,
          ])
        : bytes;
    assert.equal(
      sha256(emitted),
      file.sha256,
      `Tested asset differs from the candidate source: ${file.path}`,
    );
  }
  assert(
    isDeepStrictEqual(
      manifest.modules,
      modules.map((module) => ({
        path: module.path,
        compiler: module.compiler,
        inputs: module.inputs,
      })),
    ),
    'Compiled module inputs changed after assembly',
  );
  return {
    schemaVersion: 1,
    verifiedAt: now(),
    gitSha: manifest.gitSha,
    sourceDirty: manifest.sourceDirty,
    sourceAssetSha256: manifest.sourceAssetSha256,
    artifactSha256: manifest.artifactSha256,
    modules: manifest.modules,
    files: actual.length,
    site,
  };
}

function timeoutMs(value = DEFAULT_TIMEOUT_MS) {
  const parsed = Number(value);
  assert(
    Number.isSafeInteger(parsed) && parsed > 0,
    'Gate timeout must be a positive integer in milliseconds',
  );
  return parsed;
}

// Every entry is required. Deleting a verifier or corpus must fail, not skip.
export function batteryGates(out, env = process.env) {
  const node = (name, file, args = [], report) => ({
    name,
    command: process.execPath,
    args: [file, ...args],
    requiredPath: file,
    ...(report ? { report } : {}),
  });
  const npm = (name, script, args = []) => ({
    name,
    command: 'npm',
    args: ['run', script, ...args],
  });
  const tool = (file) => `prototypes/corridor/tools/${file}.mjs`;
  const report = (gate, type, name = 'verification-report.json') => ({
    path: join(out, gate, name),
    type,
  });
  const py =
    env.KAIRO_CORPUS_PYTHON ||
    (existsSync(join(homedir(), '.venv-bunki-corpus/bin/python'))
      ? join(homedir(), '.venv-bunki-corpus/bin/python')
      : 'python3');
  return [
    node('release-gates', 'scripts/verify-release-gates.mjs', [
      '--out',
      join(out, 'runner-verification'),
    ]),
    node(
      'corridor-build',
      'scripts/verify-corridor-build.mjs',
      [],
      report('corridor-build', 'checks'),
    ),
    node('reference-core', 'tools/test-reference-core.mjs', [
      '--evidence-out',
      join(out, 'reference-core'),
    ]),
    node('reference-data', 'tools/build-reference-data.mjs', ['--check']),
    node('reference-ui-contracts', tool('test-reference-ui')),
    node('skip-core', tool('test-skip-core')),
    node('skip-ui-contracts', tool('test-skip-ui')),
    node('kanji-capture', tool('test-kanji-capture')),
    node('navigation-returns', tool('test-navigation-returns')),
    node('reference-packaging', tool('test-reference-packaging')),
    node('skip-packaging', tool('test-skip-packaging')),
    node('reference-browser', tool('verify-reference')),
    node('reference-connections', tool('verify-reference-connections')),
    node('skip-browser', tool('verify-skip-ui')),
    node('skip-standalone', tool('verify-skip-standalone')),
    npm('format-check', 'format:check'),
    npm('lint', 'lint'),
    node('corridor-lint', 'node_modules/eslint/bin/eslint.js', [
      '--no-ignore',
      '--config',
      'scripts/corridor-eslint.config.mjs',
      'prototypes/corridor/corridor.js',
      'prototypes/corridor/reading-controller.mjs',
      'prototypes/corridor/teacher-context.mjs',
      'prototypes/corridor/teacher-drafts.mjs',
      'prototypes/corridor/teacher-draft-controller.mjs',
      'prototypes/corridor/sentence-drafts.mjs',
      'prototypes/corridor/sentence-draft-controller.mjs',
      'prototypes/corridor/reading-position.mjs',
      'prototypes/corridor/feed-controller.mjs',
      'prototypes/corridor/assessment-controller.mjs',
      'prototypes/corridor/record-controller.mjs',
      'prototypes/corridor/record-host.mjs',
      'prototypes/corridor/record-app.mjs',
      'prototypes/corridor/record-binding.mjs',
      'prototypes/corridor/record-sync.mjs',
      'prototypes/corridor/publisher-controller.mjs',
      'prototypes/corridor/source-inbox.mjs',
      'prototypes/corridor/source-processing.mjs',
      'prototypes/corridor/sw.js',
      'prototypes/corridor/corridor-ink.js',
      'prototypes/corridor/dictionary-worker.js',
      'prototypes/corridor/drift-layer.js',
    ]),
    npm('typecheck', 'typecheck'),
    {
      name: 'teacher-context-contract',
      command: process.execPath,
      args: ['--test', tool('teacher-context.test')],
      requiredPath: tool('teacher-context.test'),
    },
    node('teacher-context-integration', tool('verify-teacher-context')),
    {
      name: 'teacher-drafts-contract',
      command: process.execPath,
      args: ['--test', tool('teacher-drafts.test'), tool('teacher-draft-controller.test')],
      requiredPath: tool('teacher-drafts.test'),
    },
    node('teacher-drafts-integration', tool('verify-teacher-drafts')),
    {
      name: 'sentence-drafts-contract',
      command: process.execPath,
      args: ['--test', tool('sentence-drafts.test'), tool('sentence-draft-controller.test')],
      requiredPath: tool('sentence-drafts.test'),
    },
    node('sentence-drafts-integration', tool('verify-sentence-drafts')),
    node('browser-audio-silence-contract', tool('browser-audio-silence.test')),
    node('source-kanji-practice-contract', tool('source-kanji-practice.test')),
    node('source-kanji-practice-integration', tool('verify-source-kanji-practice')),
    {
      name: 'source-inbox-contract',
      command: process.execPath,
      args: [
        '--test',
        tool('source-inbox.test'),
        tool('listening-intake.test'),
        tool('timed-transcript.test'),
        tool('file-intake.test'),
        tool('sentence-practice.test'),
        join(ROOT, 'apps/kairo-ios/Tests/HostBridge.test.mjs'),
      ],
      requiredPath: tool('source-inbox.test'),
    },
    node('source-inbox-integration', tool('verify-source-inbox')),
    node('listening-intake-integration', tool('verify-listening-intake')),
    node('timed-transcript-integration', tool('verify-timed-transcript')),
    node('source-learning-integration', tool('verify-source-learning')),
    node('sentence-practice-integration', tool('verify-sentence-practice')),
    node('sentence-feedback-integration', tool('verify-sentence-feedback')),
    node('bundled-practice-integration', tool('verify-bundled-practice')),
    node('bundled-listening-integration', tool('verify-bundled-listening')),
    node('bundled-listening-catalog', tool('build-listening-cues'), ['--check']),
    node('bundled-listening-failures', tool('verify-listening-failures')),
    node('later-encounters-contracts', tool('sentence-reading.test')),
    node('later-encounters-integration', tool('verify-later-encounters')),
    {
      name: 'source-processing-contract',
      command: process.execPath,
      args: ['--test', tool('source-processing.test')],
      requiredPath: tool('source-processing.test'),
    },
    node('source-processing-integration', tool('verify-source-processing')),
    node('tutor-request-binding-integration', tool('verify-tutor-request-binding')),
    {
      name: 'reading-position-contract',
      command: process.execPath,
      args: ['--test', tool('reading-position.test')],
      requiredPath: tool('reading-position.test'),
    },
    node('reading-position-integration', tool('verify-record-reading-position')),
    npm('vitest', 'test'),
    {
      name: 'desktop-host',
      command: process.execPath,
      args: [
        '--test',
        'prototypes/bunki-desktop/test/host.test.cjs',
        'prototypes/bunki-desktop/test/boundaries.test.cjs',
        'prototypes/bunki-desktop/test/feed-network.test.cjs',
        'prototypes/bunki-desktop/test/feed-service.test.cjs',
        'prototypes/bunki-desktop/test/publisher-network.test.cjs',
        'prototypes/bunki-desktop/test/publisher-reader.test.cjs',
        'prototypes/bunki-desktop/test/publisher-alma.test.cjs',
        'prototypes/bunki-desktop/test/native-rpc-byte-port.test.cjs',
        'prototypes/bunki-desktop/test/host-stage.test.cjs',
        'prototypes/bunki-desktop/test/native-cloud-sync.test.cjs',
        'prototypes/bunki-desktop/test/record-sync-ipc.test.cjs',
        'prototypes/bunki-desktop/test/native-files.test.cjs',
        'prototypes/bunki-desktop/test/native-intake.test.cjs',
        'prototypes/bunki-desktop/test/main-document-trust.test.cjs',
      ],
      requiredPath: 'prototypes/bunki-desktop/test/host.test.cjs',
    },
    node(
      'corridor',
      tool('verify-corridor'),
      ['--shots', join(out, 'corridor/screenshots')],
      report('corridor', 'checks'),
    ),
    node(
      'corridor-a11y',
      tool('verify-corridor-accessibility'),
      [],
      report('corridor-a11y', 'checks'),
    ),
    npm('writing-room', 'verify:writing-room'),
    {
      ...node('shelf-search', tool('verify-shelf-search'), [], {
        ...report('shelf-search', 'shelf-search', 'shelf-search-report.json'),
        engines: ['chromium', 'webkit'],
      }),
      env: { KAIRO_BROWSER: 'all' },
    },
    {
      ...node('record-note-views', tool('verify-record-note-views'), [], {
        ...report('record-note-views', 'record-note-views', 'receipt.json'),
        engines: ['chromium', 'webkit'],
      }),
      env: { KAIRO_BROWSER: 'all' },
    },
    {
      ...node('record-note-create', tool('verify-record-note-create'), [], {
        ...report('record-note-create', 'record-note-create', 'receipt.json'),
        engines: ['chromium', 'webkit'],
      }),
      env: { KAIRO_BROWSER: 'all' },
    },
    {
      ...node('record-note-lifecycle', tool('verify-record-note-lifecycle'), [], {
        ...report('record-note-lifecycle', 'record-note-lifecycle', 'receipt.json'),
        engines: ['chromium', 'webkit'],
      }),
      env: { KAIRO_BROWSER: 'all' },
    },
    {
      ...node('record-note-restore', tool('verify-record-note-restore'), [], {
        ...report('record-note-restore', 'record-note-restore', 'receipt.json'),
        engines: ['chromium', 'webkit'],
      }),
      env: { KAIRO_BROWSER: 'all' },
    },
    {
      ...node('record-practice-finalize', tool('verify-record-practice-finalize'), [], {
        ...report('record-practice-finalize', 'record-practice-finalize', 'receipt.json'),
        engines: ['chromium', 'webkit'],
      }),
      env: { KAIRO_BROWSER: 'all' },
    },
    node('storage-integ', tool('verify-corridor-storage-integrity')),
    node('record-integrity', tool('verify-record-integrity')),
    node('record-controller', tool('verify-record-controller')),
    {
      ...node('record-controller-webkit', tool('verify-record-controller')),
      env: { KAIRO_BROWSER: 'webkit' },
    },
    node('record-host', tool('verify-record-host')),
    { ...node('record-host-webkit', tool('verify-record-host')), env: { KAIRO_BROWSER: 'webkit' } },
    node('record-binding', tool('verify-record-binding')),
    node('record-sync', tool('verify-record-sync')),
    node('record-binding-browser', tool('verify-record-binding'), ['--browser']),
    {
      ...node('record-binding-webkit', tool('verify-record-binding'), ['--browser']),
      env: { KAIRO_BROWSER: 'webkit' },
    },
    ...['chromium', 'webkit'].flatMap((engine) => [
      {
        ...node(`record-sync-backup-${engine}`, tool('verify-record-sync-backup'), [], {
          path: join(out, `record-sync-backup-${engine}`, 'receipt.json'),
          type: 'record-sync-backup',
          engine,
        }),
        env: { KAIRO_BROWSER: engine },
      },
      {
        ...node(`record-app-${engine}`, tool('verify-record-app')),
        env: { KAIRO_BROWSER: engine },
      },
      {
        ...node(`record-live-${engine}`, tool('verify-record-live'), [], {
          path: join(out, `record-live-${engine}`, engine, 'receipt.json'),
          type: 'record-live',
          engine,
        }),
        env: { KAIRO_BROWSER: engine },
      },
      {
        ...node(`learning-record-${engine}`, tool('verify-learning-record'), ['--browser'], {
          path: join(out, `learning-record-${engine}`, 'learning-record.json'),
          type: 'learning-record',
          engine,
        }),
        env: { KAIRO_BROWSER: engine },
      },
      {
        ...node(`drift-record-${engine}`, tool('verify-drift-record'), [], {
          path: join(out, `drift-record-${engine}`, 'drift-record-report.json'),
          type: 'drift-record',
          engine,
        }),
        env: { KAIRO_BROWSER: engine },
      },
    ]),
    npm('drift-fast', 'verify:drift:fast', [
      '--',
      '--out',
      join(out, 'drift-fast/report.json'),
      '--shots',
      join(out, 'drift-fast/screenshots'),
    ]),
    node(
      'drift-hunt',
      tool('verify-drift-hunt'),
      [],
      report('drift-hunt', 'drift-hunt', 'drift-hunt-report.json'),
    ),
    node('corridor-ai', tool('verify-corridor-ai')),
    node(
      'teaching-context',
      tool('test-teaching-context'),
      ['--evidence-out', join(out, 'teaching-context')],
      report('teaching-context', 'teaching-context', 'result.json'),
    ),
    node(
      'ai-adaptation',
      tool('verify-ai-adaptation'),
      ['--case', 'all', '--evidence-out', join(out, 'ai-adaptation')],
      report('ai-adaptation', 'ai-adaptation', 'receipt.json'),
    ),
    node(
      'search-fallback-core',
      tool('test-search-fallback'),
      ['--evidence-out', join(out, 'search-fallback-core')],
      report('search-fallback-core', 'search-fallback-core', 'receipt.json'),
    ),
    node(
      'search-fallback-ui',
      tool('verify-search-fallback'),
      ['--case', 'all', '--evidence-out', join(out, 'search-fallback-ui')],
      report('search-fallback-ui', 'search-fallback-ui', 'receipt.json'),
    ),
    node(
      'standalone-journey',
      tool('verify-journey'),
      ['--evidence-out', join(out, 'standalone-journey')],
      report('standalone-journey', 'standalone-journey', 'results.json'),
    ),
    node('import-provider', tool('verify-import-provider')),
    node('playback', tool('verify-playback')),
    node('reading-candidates', tool('verify-reading-candidates')),
    {
      ...node('reading-candidates-webkit', tool('verify-reading-candidates')),
      env: { KAIRO_BROWSER: 'webkit' },
    },
    node('personal-reading', tool('verify-personal-reading')),
    {
      ...node('personal-reading-webkit', tool('verify-personal-reading')),
      env: { KAIRO_BROWSER: 'webkit' },
    },
    node('source-shelf', tool('verify-source-shelf')),
    {
      ...node('source-shelf-webkit', tool('verify-source-shelf')),
      env: { KAIRO_BROWSER: 'webkit' },
    },
    node('publisher-contracts', tool('verify-publisher-reading'), [], {
      path: join(out, 'publisher-contracts/receipt.json'),
      type: 'publisher',
      mode: 'contracts',
    }),
    {
      ...node('alma-reading', tool('verify-alma-reading'), [], {
        path: join(out, 'alma-reading/receipt.json'),
        type: 'alma-reading',
        engines: ['chromium', 'webkit'],
      }),
      env: { KAIRO_BROWSER: 'all' },
    },
    {
      ...node('publisher-reading', tool('verify-publisher-reading'), ['--ui'], {
        path: join(out, 'publisher-reading/receipt.json'),
        type: 'publisher',
        mode: 'ui',
        engine: 'chromium',
        offlineFault: 'context-offline',
      }),
      env: { KAIRO_BROWSER: 'chromium', KAIRO_PUBLISHER_OFFLINE_FAULT: 'context-offline' },
    },
    {
      ...node('publisher-reading-webkit', tool('verify-publisher-reading'), ['--ui'], {
        path: join(out, 'publisher-reading-webkit/receipt.json'),
        type: 'publisher',
        mode: 'ui',
        engine: 'webkit',
        offlineFault: 'server-disconnected',
      }),
      env: { KAIRO_BROWSER: 'webkit', KAIRO_PUBLISHER_OFFLINE_FAULT: 'server-disconnected' },
    },
    node('tutor-quiz-storage', tool('verify-tutor-quiz-storage'), [], {
      path: join(out, 'tutor-quiz-storage/receipt.json'),
      type: 'tutor-quiz',
      engine: 'chromium',
    }),
    {
      ...node('tutor-quiz-storage-webkit', tool('verify-tutor-quiz-storage'), [], {
        path: join(out, 'tutor-quiz-storage-webkit/receipt.json'),
        type: 'tutor-quiz',
        engine: 'webkit',
      }),
      env: { KAIRO_BROWSER: 'webkit' },
    },
    node('offline', tool('verify-offline'), [], { path: join(out, 'offline'), type: 'offline' }),
    {
      ...node('prefetch-lifecycle', tool('verify-prefetch-lifecycle'), [], {
        path: join(out, 'prefetch-lifecycle/receipt.json'),
        type: 'prefetch-lifecycle',
        engines: ['chromium', 'webkit'],
      }),
      env: { KAIRO_BROWSER: 'all' },
    },
    node('mock', tool('verify-mock')),
    node('assessment-controller', tool('verify-assessment-controller')),
    {
      ...node('practice-history', tool('verify-practice-history'), [], {
        path: join(out, 'practice-history/receipt.json'),
        type: 'practice',
        engine: 'chromium',
        offlineFault: 'context-offline',
      }),
      env: { KAIRO_BROWSER: 'chromium', KAIRO_PRACTICE_OFFLINE_FAULT: 'context-offline' },
    },
    {
      ...node('practice-history-webkit', tool('verify-practice-history'), [], {
        path: join(out, 'practice-history-webkit/receipt.json'),
        type: 'practice',
        engine: 'webkit',
        offlineFault: 'server-disconnected',
      }),
      env: { KAIRO_BROWSER: 'webkit', KAIRO_PRACTICE_OFFLINE_FAULT: 'server-disconnected' },
    },
    node('kagami', tool('verify-kagami')),
    node(
      'native-readings',
      tool('verify-native-readings'),
      [
        '--shots',
        join(out, 'native-readings/screenshots'),
        '--report',
        join(out, 'native-readings/report.json'),
      ],
      report('native-readings', 'native', 'report.json'),
    ),
    npm('replay', 'test:replay'),
    npm('export', 'verify:export'),
    npm('e2e-build', 'test:e2e:build'),
    npm('e2e', 'test:e2e', ['--', '--output', join(out, 'expo-e2e')]),
    {
      name: 'corpus-pytest',
      command: py,
      args: ['-m', 'pytest', 'tests', '-q', '-m', 'not realdata'],
      cwd: 'corpus',
      requiredPath: 'corpus/tests',
    },
  ].map((gate) => ({
    ...gate,
    ...(gate.name === 'drift-fast' ? { report: report('drift-fast', 'drift', 'report.json') } : {}),
    ...([
      'practice',
      'publisher',
      'tutor-quiz',
      'record-live',
      'learning-record',
      'drift-record',
      'record-sync-backup',
      'offline',
      'drift-hunt',
      'shelf-search',
      'record-note-views',
      'record-note-create',
      'record-note-lifecycle',
      'record-note-restore',
      'record-practice-finalize',
      'alma-reading',
      'prefetch-lifecycle',
      'native',
      'teaching-context',
      'ai-adaptation',
      'search-fallback-core',
      'search-fallback-ui',
      'standalone-journey',
    ].includes(gate.report?.type)
      ? {
          report: {
            ...gate.report,
            artifactSha256: env.KAIRO_VERIFIED_ARTIFACT_SHA256,
            ...(gate.report.type === 'standalone-journey'
              ? {
                  siteDir: env.KAIRO_SITE_DIR ? resolve(env.KAIRO_SITE_DIR) : null,
                  sourceAssetSha256: env.KAIRO_SITE_DIR
                    ? json(join(env.KAIRO_SITE_DIR, 'build-identity.json')).sourceAssetSha256
                    : null,
                  builderSha256: createHash('sha256')
                    .update(readFileSync(resolve(ROOT, tool('build-standalone'))))
                    .digest('hex'),
                }
              : {}),
            ...(gate.report.type === 'record-practice-finalize'
              ? {
                  practiceSource: env.KAIRO_SITE_DIR
                    ? practiceGateSourceMetadata(
                        env.KAIRO_SITE_DIR,
                        env.KAIRO_VERIFIED_ARTIFACT_SHA256,
                      )
                    : null,
                }
              : {}),
            ...(['drift-hunt', 'native'].includes(gate.report.type) ? { engine: 'chromium' } : {}),
            ...([
              'drift-hunt',
              'shelf-search',
              'record-note-views',
              'record-note-create',
              'record-note-lifecycle',
              'record-note-restore',
              'record-practice-finalize',
              'alma-reading',
              'prefetch-lifecycle',
              'native',
              'teaching-context',
              'ai-adaptation',
              'search-fallback-core',
              'search-fallback-ui',
              'standalone-journey',
            ].includes(gate.report.type)
              ? {
                  sourceSha256: existsSync(resolve(ROOT, gate.requiredPath))
                    ? createHash('sha256')
                        .update(readFileSync(resolve(ROOT, gate.requiredPath)))
                        .digest('hex')
                    : null,
                }
              : {}),
          },
        }
      : {}),
    timeoutMs: timeoutMs(env.KAIRO_BATTERY_TIMEOUT_MS),
    env: {
      ...(env.KAIRO_SITE_DIR
        ? { KAIRO_SITE_DIR: env.KAIRO_SITE_DIR, KAIRO_ASSESSMENT_SITE_DIR: env.KAIRO_SITE_DIR }
        : {}),
      ...(env.KAIRO_VERIFIED_ARTIFACT_SHA256
        ? {
            KAIRO_VERIFIED_ARTIFACT_SHA256: env.KAIRO_VERIFIED_ARTIFACT_SHA256,
            KAIRO_ARTIFACT_SHA256: env.KAIRO_VERIFIED_ARTIFACT_SHA256,
            KAIRO_BINDING_SITE_SHA256: env.KAIRO_VERIFIED_ARTIFACT_SHA256,
            KAIRO_PRACTICE_SITE_SHA256: env.KAIRO_VERIFIED_ARTIFACT_SHA256,
            KAIRO_ASSESSMENT_SITE_SHA256: env.KAIRO_VERIFIED_ARTIFACT_SHA256,
            KAIRO_PUBLISHER_SITE_SHA256: env.KAIRO_VERIFIED_ARTIFACT_SHA256,
          }
        : {}),
      KAIRO_BROWSER: 'chromium',
      ...gate.env,
      KAIRO_EVIDENCE_DIR: join(out, gate.name),
    },
  }));
}

// Required behavioral coverage is independent of each producer's reported
// count. Duplicate or omitted cases cannot masquerade as a complete receipt.
const RECORD_GATE_CASES = {
  record: [
    'legacy-record-archive-and-drift-migrate-through-app-boot',
    'capture-and-reading-completion-publish-durable-state-and-reload',
    'rendered-drift-flick-commits-judgment-and-observation-together',
    'list-edits-and-note-append-commit-without-losing-own-keys',
    'word-sheet-example-arrival-keeps-pressed-list-control-and-draft',
    'word-sheet-dictionary-arrival-clears-outside-release-and-ignores-dismissed-entry',
    'native-quota-abort-retains-note-input-and-session-draft',
    'list-membership-survives-render-during-native-commit',
    'note-receipt-repaints-current-tray-and-preserves-unrelated-list-draft',
    'ui-export-and-restore-preserve-portable-record-with-local-binding',
    'quota-target-commit-keeps-capture-ui-unpublished',
    'quota-target-commit-keeps-read-finish-ui-unpublished',
    'uncertain-target-commit-keeps-capture-ui-unpublished',
    'uncertain-target-commit-keeps-read-finish-ui-unpublished',
  ],
  learningControlled: [
    'grade-rejection-keeps-schedule-log-stats-and-session-with-double-tap-guard',
    'queued-grade-recomputes-latest-card-and-preserves-concurrent-log-and-stats',
    'not-recalled-forces-again-even-if-another-grade-is-requested',
    'review-does-not-advance-a-replacement-session-after-ack',
    'stale-grade-refuses-removed-or-suspended-card-without-lost-latest-data',
    'undo-is-atomic-append-only-and-rejection-keeps-the-grade',
    'undo-does-not-overwrite-a-later-card-change',
    'dojo-evidence-waits-for-ack-and-never-creates-schedule-state',
    'recall-declaration-rejects-without-revealing-and-serializes-double-input',
    'quiz-answer-next-and-close-use-only-acknowledged-run-and-ignore-stale-buttons',
    'lesson-completion-atomically-files-score-and-evidence-after-ack',
    'explicit-enrollment-batch-is-one-save-deduplicated-and-keeps-deep-word-provenance',
    'probe-mint-and-evidence-wait-together-and-double-input-cannot-mint-twice',
    'preference-step-merges-latest-pacing-without-publishing-unacknowledged-value',
  ],
  learningBrowser: [
    'quiz-answer-rejection-and-reload-preserve-the-unanswered-question',
    'quiz-next-and-close-reject-without-advancing-or-leaving',
    'quiz-close-rejection-keeps-the-completed-run',
    'recall-declaration-rejection-keeps-the-answer-concealed',
    'review-grade-rejection-keeps-card-schedule-log-and-stats',
    'review-grade-and-undo-persist-one-schedule-with-an-append-only-revocation',
    'lesson-completion-rejection-keeps-the-last-answer',
    'lesson-completion-and-explicit-batch-enrollment-are-separate-durable-actions',
    'practice-answer-rejection-keeps-the-question-unanswered',
    'practice-navigation-rejection-keeps-the-acknowledged-answer-and-question',
    'probe-rejection-keeps-card-and-evidence-unminted',
    'probe-miss-atomically-mints-one-card-and-one-observation',
  ],
  drift: [
    'boot-without-bridge-fails-closed',
    'pending-double-input-navigation-and-confirmed-departure',
    'aborted-transaction-retains-word-and-retry-identity',
    'refuses-throw-acknowledgment',
    'refuses-non-active-acknowledgment',
    'refuses-wrong-id-acknowledgment',
    'refuses-wrong-scope-acknowledgment',
    'refuses-stale-revision-acknowledgment',
    'refuses-conflicting-revision-acknowledgment',
    'refuses-invalid-state-acknowledgment',
    'refuses-revoked-owner-acknowledgment',
    'unacknowledged-commit-restart-hydrates-once',
    'recovered-duplicate-acknowledges-the-original-gesture-once',
    'late-background-read-cannot-demote-a-newer-committed-view',
    'tap-depth-pending-surface-and-glyph-particle-judgments',
    'cue-pending-double-input-and-confirmed-retirement',
    'cue-quota-failure-retains-state-and-retry-identity',
    'cue-lost-ack-restart-hydrates-retired-hint',
    'cue-hold-retirement-does-not-grade-word',
    'cue-refuses-wrong-id-acknowledgment',
    'cue-refuses-wrong-scope-acknowledgment',
    'cue-refuses-non-active-acknowledgment',
    'cue-refuses-unretired-state-acknowledgment',
    'cue-refuses-revoked-owner-acknowledgment',
    'held-ring-edge-satellites-remain-hit-owned',
  ],
  syncBackup: [
    'full-ui-backup-retains-operation-bytes-record-and-archive',
    'old-ui-backup-preserves-current-tombstone-and-unrelated-work',
    'archive-api-replacement-preserves-operation-journal',
    'foreign-scope-ui-backup-rejected-without-any-record-change',
    'corrupt-operation-ui-backup-rejected-without-any-record-change',
    'quota-ui-restore-rolls-back-documents-journal-and-outbox-together',
    'abort-ui-restore-rolls-back-documents-journal-and-outbox-together',
  ],
};
// Independent mandatory lifecycle/gesture names. These are not inferred from
// a producer count or the report being admitted.
const OFFLINE_GATE_CASES = [
  'malformed release asset digest fails closed',
  'network response does not wait for data/share_alike/dict-v2/01.json cache write',
  'fetch event holds pending data/share_alike/dict-v2/01.json cache write',
  'cache quota failure preserves successful data/share_alike/dict-v2/01.json network response',
  'network response does not wait for corridor-ink.js cache write',
  'fetch event holds pending corridor-ink.js cache write',
  'cache quota failure preserves successful corridor-ink.js network response',
  'initial fixture preserves the staged artifact identity',
  'Pages-subpath first install activates',
  'install caches a boot core before any app page opens',
  'activation preserves other applications caches',
  'a second KAIRO installation activates',
  'second installation preserves first installation boot entries',
  'two KAIRO installations use independent cache namespaces',
  'first app startup after browser restart works offline',
  'offline startup uses the installed worker',
  'uncached network request really fails offline',
  'pinned scheduler imports offline',
  'compiled shared reading core and authored controller execute after cold offline boot',
  'foreign cache cannot supply KAIRO content',
  'streaming content cache fill completes after requesting page closes',
  'installed app is ready before update probes',
  'generation fixture changes actual JavaScript, boot data and lazy dictionary bytes',
  'old app reports its installed identity after the network release changes',
  'old app keeps its installed JavaScript and boot data',
  'previously verified old dictionary bytes remain available',
  'old worker rejects a newly deployed lazy dictionary shard',
  'rejected newer dictionary bytes are not cached under the old generation',
  'wrong-generation manifest rejects update installation',
  'wrong-generation manifest publishes no candidate cache',
  'forged-source manifest rejects update installation',
  'forged-source manifest publishes no candidate cache',
  'missing modules/reading-core.mjs rejects update installation',
  'stale modules/reading-core.mjs rejects update installation',
  'modules/reading-core.mjs failure publishes no candidate cache',
  'missing modules/feed-core.mjs rejects update installation',
  'stale modules/feed-core.mjs rejects update installation',
  'modules/feed-core.mjs failure publishes no candidate cache',
  'missing modules/assessment-core.mjs rejects update installation',
  'stale modules/assessment-core.mjs rejects update installation',
  'modules/assessment-core.mjs failure publishes no candidate cache',
  'missing modules/record-core.mjs rejects update installation',
  'stale modules/record-core.mjs rejects update installation',
  'modules/record-core.mjs failure publishes no candidate cache',
  'missing reading-controller.mjs rejects update installation',
  'stale reading-controller.mjs rejects update installation',
  'reading-controller.mjs failure publishes no candidate cache',
  'missing feed-controller.mjs rejects update installation',
  'stale feed-controller.mjs rejects update installation',
  'feed-controller.mjs failure publishes no candidate cache',
  'missing assessment-controller.mjs rejects update installation',
  'stale assessment-controller.mjs rejects update installation',
  'assessment-controller.mjs failure publishes no candidate cache',
  'missing record-controller.mjs rejects update installation',
  'stale record-controller.mjs rejects update installation',
  'record-controller.mjs failure publishes no candidate cache',
  'missing record-host.mjs rejects update installation',
  'stale record-host.mjs rejects update installation',
  'record-host.mjs failure publishes no candidate cache',
  'missing publisher-controller.mjs rejects update installation',
  'stale publisher-controller.mjs rejects update installation',
  'publisher-controller.mjs failure publishes no candidate cache',
  'all-200 mixed-generation boot bytes reject update installation',
  'mixed-generation boot bytes publish no candidate cache',
  'partial update installation fails',
  'failed install does not publish a partial candidate cache',
  'previous installed app cold-starts offline after failed update',
  'failed update did not replace installed HTML',
  'worker restart retains its pinned manifest and rejects newer lazy bytes',
  'complete update waits while an old app window is open',
  'checking an already waiting update retains the same candidate',
  'open app still uses its complete installed version',
  'waiting update does not mix new HTML into an old client',
  'waiting update keeps old JavaScript and boot data together',
  'new version activates after the old app closes',
  'successful update removes only its obsolete scope caches',
  'new installed version cold-starts offline after browser restart',
  'cold restart uses completed updated HTML',
  'cold restart executes updated JavaScript with updated boot data',
  'activated new generation accepts its matching lazy dictionary bytes',
  'actual HTTPS entry page boots',
  'actual index.html automatically registers and controls its scope',
  'historical deployed v2 worker installs in an isolated profile',
  'historical worker serves the online migration fixture',
  'fixed candidate waits for the existing historical worker client',
  'fixed worker takes over after historical client closes',
  'migration from historical worker cold-starts offline',
  'migrated installation retains its verified build identity offline',
  'no unexpected page errors',
];

const HUNT_GATE_CASES = [
  'hunt · a lifting pinch finger never grades the word beneath a third finger',
  'hunt · explainer taps do not dismantle the world beneath it',
  'hunt · the explainer close button is reachable by a finger',
  'hunt · the explainer closes without navigating the app away',
  'hunt · a slow drag on water inside a dive does not surface a level',
  'hunt · a long press on water inside a dive does not surface a level',
  'hunt · pointercancel leaves no ghost drag offset',
  'hunt · a flick judgment sticks (the word does not rematerialize)',
  'hunt · a walked planet is never culled by the recycler',
  'hunt · a long-press keeps the word it locks onto (no headless lock)',
  'hunt · lock members are touchable words, not canvas labels',
  'hunt · tapping a constellation label answers instead of razing it',
  'hunt · a 44px near-miss under a lock forgives instead of razing',
  'hunt · a release on a hub sun releases the constellation instead of diving',
  'hunt · a finger the gesture never owned cannot carry a held word',
  'hunt · a held finger keeps a constellation alive past the 10s fade',
  'hunt · a corpus-backed semantic member is staged, hit-testable DOM interaction',
  'hunt · a kana-only word focuses cleanly and its bloom admits no strangers',
  'hunt · a foreign pointermove cannot drag a touch-held word',
  'hunt · a replacement pinch pair rebases before its first translated move',
  'hunt · a rebased replacement pair remains a live pinch',
  'hunt · a stationary active pointer prevents bloom lifecycle expiry beneath it',
  'hunt · foreign cancel cannot erase a tracked hand or its bloom lifecycle',
  'hunt · node-down/far-up without a delivered move is not a tap, drag, or grade',
  'hunt · hub release cannot hijack a gesture or leave themed ghost satellites',
  'hunt · no page errors across the regression battery',
];

const SHELF_SEARCH_GATE_CASES = [
  'shelf-latest-query-core-result-under-100ms',
  'shelf-rapid-edit-backspace-keeps-latest-results',
  'shelf-delayed-worker-reply-cannot-replace-new-query',
  'shelf-cleared-or-departed-query-ignores-late-worker',
];
const NOTE_VIEW_GATE_CASES = [
  'empty-tray-import-preserves-concurrent-note-choices-and-exact-segments',
  'foreground-receive-preserves-drafts-and-rejects-late-owner-publication',
  'tombstone-stale-backup-and-explicit-restore-remain-truthful',
];
const NOTE_CREATE_GATE_CASES = [
  'ui-exact-original-notes-held-commit-newer-draft-and-full-backup-reopen',
  'ui-quota-keeps-draft-and-native-history',
  'ui-abort-keeps-draft-and-native-history',
  'ui-revoked-before-native-write-keeps-draft-and-disables-save',
  'ui-durable-before-revocation-cannot-publish-or-clear-draft',
  'native-app-concurrent-creates-preserve-predecessor-and-reject-forged-inputs',
  'native-host-exact-acknowledged-retry-and-command-conflict',
  'native-host-lost-completion-reopen-retry-retains-one-operation',
  'native-host-session-loss-after-commit-retains-history-without-publication',
];
const NOTE_LIFECYCLE_GATE_CASES = [
  'edit-ime-pending-newer-draft-reload',
  'stale-receive-retains-focused-composition-and-rebase',
  'explicit-conflict-choice-keeps-segments-and-all-provenance',
  'concrete-delete-confirmation-cancel-and-draft-retention',
  'native-quota-keeps-edit-draft',
  'native-abort-keeps-edit-draft',
  'native-lost-ack-keeps-edit-draft',
  'native-revoke-keeps-edit-draft',
  'quoted-heads-immutable-and-empty-generation-explicit-fresh-text',
  'durable-edit-with-later-receive-keeps-hidden-draft',
  'empty-generation-concurrent-tombstone-keeps-fresh-draft',
  'draft-scope-cannot-follow-identical-note-id-into-another-installation',
  'stale-delete-confirmation-cannot-delete-newly-received-text',
  'concurrent-empty-restore-generations-do-not-rebind-fresh-draft',
  'pre-input-ime-tombstone-retains-editor-through-final-input',
];
const NOTE_RESTORE_GATE_CASES = [
  'explicit-saved-original-restoration-is-one-atomic-visible-pair',
  'user-selects-conflicting-original-and-preserves-all-copy-provenance',
  'review-and-confirmation-cancellation-never-restores-implicitly',
  'quote-only-history-is-never-displayed-or-eligible-for-original-restoration',
  'native-quota-keeps-restoration-atomic-and-draft-safe',
  'native-abort-keeps-restoration-atomic-and-draft-safe',
  'native-lost-ack-keeps-restoration-atomic-and-draft-safe',
  'native-revoke-keeps-restoration-atomic-and-draft-safe',
  'sole-current-empty-generation-restores-chosen-text-without-another-generation',
  'multiple-empty-generations-explicitly-refuse-restoration',
  'new-hidden-history-invalidates-confirmed-preview-without-partial-generation',
  'pending-restore-preserves-active-composition-and-newer-unsent-draft',
  'later-native-tombstone-before-acknowledgement-is-never-labeled-visible-restoration',
  'departed-preview-cannot-restore-or-display-retained-original-text',
  'pending-native-preview-preserves-composition-and-focused-draft',
];
const PRACTICE_FINALIZE_GATE_CASES = [
  'submission-atomic-exact-minimal-operation',
  'abandonment-dismiss-atomic-no-response',
  'ordinary-practice-writes-emit-none',
  'independent-attempts-keep-distinct-operations',
  'retry-after-unrelated-write-and-acknowledgement',
  'changed-intent-same-command-refused',
  'fresh-command-double-finalization-refused',
  'mismatched-command-scope-refused',
  'tampered-form-reference-refused',
  'stale-attempt-revision-refused',
  'stale-store-revision-refused',
  'mismatched-library-scope-refused',
  'tampered-item-reference-refused',
  'unsupported-response-kind-refused',
  'owner-loss-before-commit-refused',
  'session-loss-before-commit-refused',
  'native-abort-rolls-back',
  'native-quota-rolls-back',
  'native-lost-ack-reopen-exact-retry',
  'native-owner-loss-at-complete-preserves-proof',
  'later-and-concurrent-tombstones-remain-suppressed',
  'backward-wall-clock-keeps-recorded-duration',
  'independent-app-gate-refuses-operation-omitted',
  'independent-app-gate-refuses-operation-duplicated',
  'independent-app-gate-refuses-terminal-record-omitted',
  'independent-app-gate-refuses-receipt-altered',
  'independent-app-gate-refuses-scope-altered',
  'rendered-new-library-owned-scope-and-submission',
  'rendered-abandonment-dismiss-and-rollback-preserve-ui',
  'rendered-historical-mismatch-remains-local',
  'history-eligibility-identical-exam-unchanged-host',
  'history-eligibility-identical-exam-host-guards-omitted',
  'history-eligibility-tombstone-unchanged-host',
  'history-eligibility-tombstone-host-guards-omitted',
];
const PRACTICE_RUNTIME_PATHS = [
  'corridor.js',
  'record-host.mjs',
  'record-app.mjs',
  'assessment-controller.mjs',
  'record-controller.mjs',
  'modules/record-core.mjs',
  'modules/assessment-core.mjs',
];
const PRACTICE_HOST_CONTROLS = [
  'operation-omitted',
  'operation-duplicated',
  'terminal-record-omitted',
  'receipt-altered',
  'scope-altered',
  'history-guards-omitted',
];

/** Expected input identities come from the already-verified site, not from the
 * producer receipt. Synthetic fixture metadata conveys no account authority. */
function practiceGateSourceMetadata(site, artifactSha256) {
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const manifest = json(join(site, 'build-identity.json'));
  assert.match(artifactSha256 || '', /^[a-f0-9]{64}$/u);
  assert.equal(manifest.artifactSha256, artifactSha256);
  const read = (path) => {
    const bytes = readFileSync(join(site, path));
    const identity = manifest.files.find((file) => file.path === path);
    assert.equal(identity?.bytes, bytes.length, `Practice source size differs: ${path}`);
    assert.equal(identity?.sha256, hash(bytes), `Practice source identity differs: ${path}`);
    return bytes;
  };
  const runtime = new Map(PRACTICE_RUNTIME_PATHS.map((path) => [path, read(path)]));
  const runtimeInputs = [...runtime].map(([path, bytes]) => ({
    path,
    sha256: hash(bytes),
    bytes: bytes.length,
    overridden: false,
  }));
  const setBytes = read('data/mock/sets/n5-01.json');
  const fullSet = JSON.parse(setBytes);
  const smallSet = {
    ...fullSet,
    sections: fullSet.sections.map((section) => ({ ...section, items: section.items.slice(0, 1) })),
  };
  const normalize = (value) =>
    Array.isArray(value)
      ? value.map(normalize)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, normalize(value[key])]),
          )
        : value;
  const host = runtime.get('record-host.mjs').toString();
  const finalizeStart = host.indexOf('  async #finalizePractice(');
  const finalizeEnd = host.indexOf('\n  async #', finalizeStart + 1);
  assert(
    finalizeStart > 0 && finalizeEnd > finalizeStart,
    'Practice controls require the named finalization method',
  );
  const finalize = host.slice(finalizeStart, finalizeEnd);
  const mutateFinalize = (needle, replacement) => {
    assert.equal(
      finalize.split(needle).length,
      2,
      'Practice mutation must target one exact finalization boundary',
    );
    return (
      host.slice(0, finalizeStart) + finalize.replace(needle, replacement) + host.slice(finalizeEnd)
    );
  };
  const needle = 'const outcome = await this.#controller.commitLocal(request);';
  assert.equal(
    finalize.split(needle).length,
    2,
    'Practice controls require the exact named commit boundary',
  );
  const mutations = [
    ['operation-omitted', '{ ...request, operations: [] }'],
    [
      'operation-duplicated',
      '{ ...request, operations: [...request.operations, ...request.operations] }',
    ],
    ['terminal-record-omitted', '{ ...request, mutations: request.mutations.slice(1) }'],
    [
      'receipt-altered',
      "{ ...request, mutations: request.mutations.map((row, index) => index === 2 ? { ...row, value: { ...row.value, recordSha256: '0'.repeat(64) } } : row) }",
    ],
    [
      'scope-altered',
      "{ ...request, binding: { ...request.binding, learnerId: 'unrelated-host-scope' } }",
    ],
  ].map(([name, request]) => [
    name,
    mutateFinalize(needle, `const outcome = await this.#controller.commitLocal(${request});`),
  ]);
  const guards = `    insist(!state.snapshot.replica.operations.some((operation) => operation.payload.kind === 'exam.attempt' &&
      operation.payload.attemptId === input.attemptId), 'practice-already-emitted');
    insist(!state.snapshot.replica.projection.entities.some((entry) => entry.target.kind === 'exam-attempt' &&
      entry.target.id === input.attemptId && entry.tombstones.length > 0), 'practice-already-deleted');`;
  assert.equal(
    finalize.split(guards).length,
    2,
    'Practice controls require both exact host history guards',
  );
  mutations.push([
    'history-guards-omitted',
    mutateFinalize(
      guards,
      '    // Independent review mutation: omit preexisting history eligibility checks.',
    ),
  ]);
  return {
    runtimeInputs,
    fixture: {
      setSha256: hash(setBytes),
      syntheticSubsetSha256: hash(JSON.stringify(normalize(smallSet))),
      authorization: 'synthetic-fixture-only',
    },
    authoredNegativeHostMutations: mutations.map(([name, bytes]) => ({
      name,
      sha256: hash(bytes),
      originalSha256: hash(host),
    })),
  };
}

function requirePracticeSourceMetadata(source) {
  assert(
    source && typeof source === 'object' && !Array.isArray(source),
    'Practice source metadata is required',
  );
  assert.deepEqual(Object.keys(source).sort(), [
    'authoredNegativeHostMutations',
    'fixture',
    'runtimeInputs',
  ]);
  assert(Array.isArray(source.runtimeInputs));
  assert.deepEqual(
    source.runtimeInputs.map((row) => row.path),
    PRACTICE_RUNTIME_PATHS,
  );
  for (const row of source.runtimeInputs) {
    assert.deepEqual(row, {
      path: row.path,
      sha256: row.sha256,
      bytes: row.bytes,
      overridden: false,
    });
    assert.match(row.sha256 || '', /^[a-f0-9]{64}$/u);
    assert(
      Number.isSafeInteger(row.bytes) && row.bytes > 0,
      'Practice runtime size must be positive',
    );
  }
  const fixture = source.fixture;
  assert.deepEqual(fixture, {
    setSha256: fixture?.setSha256,
    syntheticSubsetSha256: fixture?.syntheticSubsetSha256,
    authorization: 'synthetic-fixture-only',
  });
  assert.match(fixture.setSha256 || '', /^[a-f0-9]{64}$/u);
  assert.match(fixture.syntheticSubsetSha256 || '', /^[a-f0-9]{64}$/u);
  assert(Array.isArray(source.authoredNegativeHostMutations));
  assert.deepEqual(
    source.authoredNegativeHostMutations.map((row) => row.name),
    PRACTICE_HOST_CONTROLS,
  );
  const originalSha256 = source.runtimeInputs.find((row) => row.path === 'record-host.mjs').sha256;
  for (const row of source.authoredNegativeHostMutations) {
    assert.deepEqual(row, { name: row.name, sha256: row.sha256, originalSha256 });
    assert.match(row.sha256 || '', /^[a-f0-9]{64}$/u);
    assert.notEqual(
      row.sha256,
      originalSha256,
      'A declared practice mutation must change host bytes',
    );
  }
  assert.equal(
    new Set(source.authoredNegativeHostMutations.map((row) => row.sha256)).size,
    PRACTICE_HOST_CONTROLS.length,
  );
}

function requirePracticeReceiptMetadata(value, expected, receiptPath, engines) {
  assert.equal(value.diagnosticRoot, false, 'Diagnostic source roots cannot pass product gates');
  requirePracticeSourceMetadata(expected);
  const actual = {
    runtimeInputs: value.runtimeInputs,
    fixture: value.fixture,
    authoredNegativeHostMutations: value.authoredNegativeHostMutations,
  };
  requirePracticeSourceMetadata(actual);
  assert.deepEqual(
    actual,
    expected,
    'Practice runtime, fixture or control identities differ from the pinned site',
  );
  assert.deepEqual(
    value.results.map(({ engine, name }) => ({ engine, name })),
    engines.flatMap((engine) => PRACTICE_FINALIZE_GATE_CASES.map((name) => ({ engine, name }))),
    'Practice cases must retain exact engine and journey order',
  );
  assert(
    engines.every(
      (engine) =>
        /^\d+\.\d+(?:\.\d+){0,2}$/u.test(value.browserVersions[engine]) &&
        value.browserVersions[engine].length <= 64,
    ),
    'Practice browser versions must identify real browser builds',
  );
  const base = dirname(receiptPath);
  const receipt = lstatSync(receiptPath);
  assert(receipt.isFile() && !receipt.isSymbolicLink(), 'Practice receipt must be a real file');
  for (const row of value.results) {
    assert.deepEqual(Object.keys(row).sort(), ['elapsedMs', 'engine', 'evidence', 'name', 'pass']);
    assert(
      Number.isSafeInteger(row.elapsedMs) && row.elapsedMs >= 0,
      'Practice journey duration is missing or invalid',
    );
    assert.deepEqual(
      Object.keys(row.evidence || {}).sort(),
      ['path', 'sha256'],
      'Practice evidence metadata is missing or invalid',
    );
    const file = resolve(base, row.engine, row.name, 'evidence.json');
    assert.equal(
      row.evidence.path,
      file,
      'Practice evidence must belong to its exact engine and case',
    );
    assert.match(row.evidence.sha256 || '', /^[a-f0-9]{64}$/u);
    for (const directory of [join(base, row.engine), join(base, row.engine, row.name)]) {
      const stat = lstatSync(directory);
      assert(
        stat.isDirectory() && !stat.isSymbolicLink(),
        'Practice evidence directories must be real',
      );
    }
    const stat = lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink(), 'Practice evidence must be a real file');
    assert.equal(
      realpathSync(file),
      join(realpathSync(base), row.engine, row.name, 'evidence.json'),
    );
    const bytes = readFileSync(file);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      row.evidence.sha256,
      'Practice evidence bytes differ from their receipt',
    );
    const detail = JSON.parse(bytes);
    assert(
      detail &&
        typeof detail === 'object' &&
        !Array.isArray(detail) &&
        Object.keys(detail).length > 0,
      'Practice evidence must contain a completed observation',
    );
  }
}

const ALMA_READING_GATE_CASES = [
  'global-voices-typed-credit-license-unknowns-save-and-reload',
  'alma-ja-typed-credit-license-unknowns-save-and-reload',
];
const PREFETCH_LIFECYCLE_GATE_CASES = [
  'ordinary-timer-control',
  'real-pagehide-reload',
  'real-pagehide-close',
  'demanded-reader-while-queue-held',
  'real-pagehide-history-back',
  'real-beforeunload-delayed-reload',
  'real-beforeunload-cancelled-shared-demand',
];
const PREFETCH_LIFECYCLE_CONTRACT_CASES = [
  'ordinary queue retains delays and excludes loaded and archive bodies',
  'pagehide clears a pending native timer',
  'retained callback cannot start an article after pagehide',
  'boot completion after pagehide cannot start a queue',
  'in-flight completion cannot reschedule after pagehide',
  'failed in-flight request remains observable and cannot restart after pagehide',
  'persisted return starts one new queue and permanently fences retained old callback',
  'old in-flight completion cannot create a second queue after persisted return',
  'replacing a queue fences its retained callback',
  'persisted return before boot waits for boot to schedule',
  'beforeunload clears the pending native timer before pagehide',
  'retained callback cannot start during provisional navigation',
  'in-flight rejection after beforeunload stays visible and cannot restart',
];
const NATIVE_ARTICLE_IDS = [
  'bunki-graded-n3-zoka-sanjin-morning',
  'bunki-graded-n3-nakaima-diary',
  'bunki-graded-n3-world-beginning',
  'bunki-graded-n3-hidden-deity',
  'bunki-graded-n3-kojiki-book',
  'bunki-graded-n3-hashira-counter',
  'bunki-graded-n3-feel-jingu-forest',
  'bunki-graded-n3-musubi-visual',
  'bunki-graded-n3-gratitude-week',
  'bunki-graded-n3-thanks-before-help',
  'bunki-essay-n2-zoka-as-one',
  'bunki-essay-n2-nakaima-time',
  'bunki-essay-n2-creator-god',
  'bunki-essay-n2-silent-amenominakanushi',
  'bunki-essay-n2-kojiki-myth-history',
  'bunki-essay-n2-myth-to-book',
  'bunki-essay-n2-feel-jingu-musubi',
  'bunki-essay-n2-prayer-on-screen',
  'bunki-essay-n2-thanks-first',
  'bunki-essay-n2-testimony-literacy',
  'bunki-essay-n1-cosmic-analogy',
  'bunki-essay-n1-nakaima-time-theory',
  'bunki-essay-n1-first-versus-supreme',
  'bunki-essay-n1-silent-god-theology',
  'bunki-essay-n1-kojiki-power',
  'bunki-essay-n1-beyond-fact-fiction',
  'bunki-essay-n1-sacred-media',
  'bunki-essay-n1-ise-time',
  'bunki-essay-n1-miracle-testimony',
  'bunki-essay-n1-prayer-reality',
];
const NATIVE_GATE_CASES = [
  ...[
    'every primary index row carries a non-empty titleEn',
    'every titleEn names its provenance in titleEnSource',
    'the title marker names its author: AI for the recovered and minted rows, the shelf map for the rest',
    'the 30 authored records answer to the queue: approved rows lifted, pending rows still 検収前',
    'every archive row carries a non-empty titleEn with wrapper provenance',
    'the code-side TITLES_EN map is gone from corridor.js — titles live in data only',
    'no index row or curated body carries a stringified null date',
    '野ばら (aozora:051034) records its unknown first-publication date as absence',
    'every curated jlpt_lexicon coverage equals a reading-aware recompute from its own tokens',
    'the per-card vocab ratio discriminates — ≥6 distinct values, none covering >50% of cards',
    'the reading-override lexicon is committed with provenance and aligned entries',
    'every lexicon override site is minted into the curated bodies — no suspect reading left open',
    'deity names read かみ-family ruby at every minted site; the flagship carries no unreviewed 神(しん)',
    'the committed suspect-readings report is empty of unfixed rows and agrees with this recount',
    'the one native shelf renders exactly the curated index rows',
    'all 30 article files were served independently',
    'no request, console, or page errors across the run',
    'all completion and bookmark state persists in the native learner record',
    'the 日本語のみ chrome renders no English titles',
    'every human-review-pending row is visibly 検収前 on the 日本語のみ shelf',
    'all 30 native completions and exact bookmarks survive a real page reload',
    'the bilingual shelf renders every English title from the records themselves',
    'every human-review-pending row stays visibly 検収前 on the bilingual shelf',
    'the bilingual shelf pass added no request, console, or page errors',
  ].map((name) => ({ name, articleId: null })),
  {
    name: 'flagship DOM renders the lexicon ruby at every override site — 神 reads かみ in name positions, しん never',
    articleId: 'bunki-graded-n3-zoka-sanjin-morning',
  },
  ...NATIVE_ARTICLE_IDS.map((articleId) => ({
    name: 'native shelf/reader/lookup/settings/completion/bookmark contract',
    articleId,
  })),
];
const nativeCaseIdentity = ({ name, articleId }) => JSON.stringify({ name, articleId });

const SEARCH_FALLBACK_CASES = [
  'every graded words-only entry is indexed exactly once with its complete fallback reading and gloss',
  'existing dictionary entries keep their identity, reading, primary gloss and index order without shadows',
  'graded numeric JLPT values keep their intended search tie ranks',
  'fallback entries with no deep written counterpart remain present without loading the optional dictionary',
  'written, kana, romaji and whole glossary searches return the exact fallback while deep data is unavailable',
  'current deep counterpart selection keeps both 生物 homographs and prefers compatible seq entries',
  'fallback without a deep counterpart survives the ready deep tier with unchanged identity',
  'actual search leaves the input corpus unchanged and repeated immediate indexing stable',
];
const SEARCH_UI_CASES = ['pending', 'queries', 'missing', 'homographs', 'lifecycle'];
const SEARCH_UI_CHECKS = [
  'the exact immediate fallback opens through keyboard Enter before the deep index resolves',
  'a completed deep-index load does not replace the no-counterpart fallback identity',
  'written, kana, romaji and glossary queries each activate the exact fallback form and reading',
  'a failed optional index still leaves the correct fallback search and full immediate gloss available',
  'existing deep homographs keep exact sequence, reading and sense while switching through normal controls',
  'ordinary capture commits one exact fallback identity without a fabricated sequence or recall grade',
  'the exact captured fallback reopens from Lists after a cold reload with the deep index unavailable',
  'real recall controls grade the fallback answer and schedule only its exact word key',
];

const TEACHING_CONTEXT_CASES = [
  'Unassessed input has four sparse dimensions and no learner-level claim',
  'Chosen deck tags and private model fields are never selected',
  'Derivation metadata is fixed and rejects arbitrary or unsupported labels',
  'Observed-only successes and even a bad sampled flag cannot produce measured evidence',
  'Four distinct dimensions and sampled-but-failing remain distinct',
  'Different lower-level conflicts keep different cells despite the same summary edge',
  'Same-shaped correction is read afresh and prior returned context remains immutable',
  'Cell projection names known levels and leaves unrelated data unread',
  'Invalid, inconsistent and unbounded counts fail closed',
  'Frontier keeps observed, measured and mixed provenance without private fields',
  'Confusions remain observed and reversed duplicate pairs are removed',
  'Only the first six targets and four pairs are inspected, with fixed output caps',
  'Selected forms are bounded primitives with known kinds and single-scalar kanji',
  'Largest permitted selections remain below 8,000 serialized characters',
  'Returned nested arrays and objects are frozen clones and input is unchanged',
  'Shared public band export validates dimensions and excludes extra payload fields',
];
const AI_ADAPTATION_CASES = [
  'surfaces',
  'privacy',
  'freshness',
  'undo',
  'failed-write',
  'provider-change',
  'import-epoch',
  'source-context',
];

const STANDALONE_JOURNEY_STATIONS = [
  '1 drift front door',
  '2 shelf',
  '3 search + synonym cluster + entry',
  '4 reader capture',
  '5 learner mark in the text',
  '6 shelf 途中 tag',
  '7 JLPT lesson end to end',
  '8 tray → review → summary',
  '9 review trace on the tray',
  '10 levels · grammar(100+) · thesaurus · 字引',
  '11 return to the drift',
  '12 same-file offline reload retains the exact learner record',
];
const STANDALONE_RECORD_MODULES = [
  './record-controller.mjs',
  './record-binding.mjs',
  './record-app.mjs',
  './record-sync.mjs',
  './modules/record-core.mjs',
];

function requireNamedCases(rows, names, field = 'pass', accepted = true) {
  assert(Array.isArray(rows), 'No completed named checks');
  assert.deepEqual(
    rows.map((row) => row.name).sort(),
    [...names].sort(),
    'Required journey coverage incomplete or duplicated',
  );
  assert(
    rows.every((row) => row[field] === accepted),
    'Receipt contains failed or unfinished checks',
  );
}

function requireCompleteReport({
  path,
  type,
  engine,
  engines,
  offlineFault,
  artifactSha256,
  sourceSha256,
  sourceAssetSha256,
  builderSha256,
  siteDir,
  practiceSource,
  mode,
}) {
  let receiptPath = path;
  if (type === 'offline') {
    // The offline producer creates one fresh mkdtemp run beneath its gate
    // directory. Never choose the first/globbed successful receipt from retries.
    const directory = lstatSync(path);
    assert(
      directory.isDirectory() && !directory.isSymbolicLink(),
      'Offline evidence must be a real directory',
    );
    const runs = readdirSync(path).filter((name) => name.startsWith('run-'));
    assert.equal(runs.length, 1, 'Offline gate requires exactly one run directory and receipt');
    const run = join(path, runs[0]);
    const stat = lstatSync(run);
    assert(stat.isDirectory() && !stat.isSymbolicLink(), 'Offline run must be a real directory');
    receiptPath = join(run, 'receipt.json');
    const receipt = lstatSync(receiptPath);
    assert(receipt.isFile() && !receipt.isSymbolicLink(), 'Offline receipt must be a real file');
  }
  const value = json(receiptPath); // Missing, malformed and empty reports fail closed.
  if (type === 'checks') {
    assert(Array.isArray(value.results) && value.results.length > 0, 'No completed checks');
    assert(
      value.results.every((row) => row.pass === true),
      'Receipt contains failed or unfinished checks',
    );
    assert.equal(
      value.summary?.total,
      value.results.length,
      'Check count disagrees with the receipt',
    );
    assert.equal(value.summary?.failed, 0, 'Receipt reports failures');
  } else if (type === 'teaching-context' || type === 'ai-adaptation') {
    assert.equal(
      value.suite,
      type === 'teaching-context'
        ? 'actual-teaching-context-exports'
        : 'actual-request-teaching-context',
    );
    assert.equal(value.pass, true);
    assert.match(artifactSha256 || '', /^[a-f0-9]{64}$/u);
    assert.equal(value.artifactSha256, artifactSha256);
    assert.match(sourceSha256 || '', /^[a-f0-9]{64}$/u);
    assert.equal(value.verifierSha256, sourceSha256);
    if (type === 'teaching-context') {
      requireNamedCases(value.results, TEACHING_CONTEXT_CASES);
      assert.equal(value.browsers, 0);
      assert.equal(value.providerRequests, 0);
    } else {
      assert.equal(
        value.selectedCase,
        'all',
        'The required adaptation gate cannot select a subset',
      );
      requireNamedCases(value.results, AI_ADAPTATION_CASES);
      assert.equal(value.timedOut, false);
      assert.deepEqual(value.externalRequests, []);
      assert.deepEqual(value.routeErrors, []);
      assert(Array.isArray(value.browserErrors) && Array.isArray(value.expectedAbortErrors));
      assert.deepEqual(value.browserErrors, value.expectedAbortErrors);
      assert.equal(value.handles?.browserContextsCreated, 1);
      assert.equal(value.handles?.browserContextsClosed, 1);
      assert.equal(value.handles?.browserClosed, true);
      assert.equal(value.handles?.serverClosed, true);
      assert(Array.isArray(value.checks) && value.checks.every((row) => row.pass === true));
      assert.equal(
        value.checks.filter(
          (row) => row.name === 'all six teaching request surfaces were actually observed',
        ).length,
        1,
      );
    }
  } else if (type === 'search-fallback-core' || type === 'search-fallback-ui') {
    const browser = type === 'search-fallback-ui';
    assert.equal(
      value.suite,
      browser ? 'actual-ui-search-fallback' : 'actual-source-search-fallback',
    );
    assert.equal(value.pass, true);
    assert.match(artifactSha256 || '', /^[a-f0-9]{64}$/u);
    assert.equal(value.artifactSha256, artifactSha256);
    assert.match(sourceSha256 || '', /^[a-f0-9]{64}$/u);
    assert.equal(value.verifierSha256, sourceSha256);
    if (!browser) {
      requireNamedCases(value.checks, SEARCH_FALLBACK_CASES);
      assert.equal(value.baseline, null, 'Required core gate uses the current artifact');
    } else {
      assert.equal(value.selectedCase, 'all', 'Required search gate cannot select a subset');
      requireNamedCases(value.results, SEARCH_UI_CASES);
      requireNamedCases(value.checks, SEARCH_UI_CHECKS);
      assert.equal(value.timedOut, false);
      assert.deepEqual(value.externalRequests, []);
      assert.deepEqual(value.routeErrors, []);
      assert(Array.isArray(value.errors) && Array.isArray(value.expectedFaultErrors));
      assert.deepEqual(value.errors, value.expectedFaultErrors);
      assert(
        value.errors.every(
          (entry) =>
            entry.type === 'console' &&
            ['missing', 'lifecycle'].includes(entry.case) &&
            entry.location?.url === value.origin + '/data/share_alike/dict-v2/index.json' &&
            entry.error.includes('503'),
        ),
        'Only the declared optional-index 503 console faults may be accepted',
      );
      assert.equal(value.handles?.contextsCreated, 1);
      assert.equal(value.handles?.contextsClosed, 1);
      assert.equal(value.handles?.browserClosed, true);
      assert.equal(value.handles?.serverClosed, true);
    }
  } else if (type === 'standalone-journey') {
    const receiptStat = lstatSync(path);
    assert(
      receiptStat.isFile() && !receiptStat.isSymbolicLink(),
      'Journey receipt must be a real file',
    );
    assert.equal(value.schemaVersion, 1);
    assert.equal(value.pass, true);
    assert.equal(value.status, 'passed');
    for (const digest of [artifactSha256, sourceAssetSha256, sourceSha256, builderSha256])
      assert.match(digest || '', /^[a-f0-9]{64}$/u, 'Required journey identity is missing');
    assert.equal(value.expectedArtifactSha256, artifactSha256);
    assert.equal(value.artifactSha256, artifactSha256);
    assert.equal(value.sourceAssetSha256, sourceAssetSha256);
    assert.equal(value.verifier?.sha256, sourceSha256);
    assert.equal(value.finalVerifierSha256, sourceSha256);
    assert.equal(value.builder?.sha256, builderSha256);
    assert.equal(value.finalBuilderSha256, builderSha256);
    assert.equal(typeof siteDir, 'string');
    assert(isAbsolute(siteDir), 'Journey artifact directory must be pinned');
    assert.equal(value.site, siteDir);
    assert.deepEqual(value.expectedStations, STANDALONE_JOURNEY_STATIONS);
    assert.deepEqual(value.passed, STANDALONE_JOURNEY_STATIONS);
    for (const field of [
      'failures',
      'skipped',
      'startupErrors',
      'cleanupErrors',
      'stationErrors',
      'identityErrors',
      'pageErrors',
      'blockedRequests',
    ])
      assert.deepEqual(value[field], [], field);
    assert.equal(value.timedOut, false);
    assert.equal(value.audioOutput?.mode, 'test-silenced');
    assert.equal(value.browser?.engine, 'chromium');
    assert.equal(typeof value.browser?.version, 'string');
    assert(value.browser.version.length > 0, 'Actual browser version is missing');
    assert.equal(typeof value.browser?.executablePath, 'string');
    assert(isAbsolute(value.browser.executablePath), 'Actual browser executable is missing');
    const handles = value.handles;
    assert(Number.isSafeInteger(handles?.processId) && handles.processId > 0);
    for (const field of [
      'browserCreated',
      'contextCloseAttempted',
      'contextClosed',
      'browserCloseAttempted',
      'browserClosed',
      'finalPageClosed',
    ])
      assert.equal(handles[field], true, field);
    assert.equal(handles.contextsCreated, 1);
    assert.equal(handles.finalBrowserConnected, false);
    assert.equal(handles.finalContextCount, 0);
    assert.match(value.recoveredRecordSha256 || '', /^[a-f0-9]{64}$/u);
    const standalone = value.standalone;
    assert.equal(standalone?.status, 'passed');
    assert.equal(standalone.artifactSha256, artifactSha256);
    assert.equal(standalone.site, siteDir);
    assert.equal(standalone.builderSha256, builderSha256);
    assert.equal(standalone.selfContainedController, true);
    assert.equal(standalone.recordModuleTransport, 'blob');
    assert.equal(standalone.inlinedModuleTransport, 'blob');
    assert.equal(standalone.driftSharesRecordRuntime, true);
    assert.deepEqual(standalone.inlinedRecordModules, STANDALONE_RECORD_MODULES);
    assert.match(standalone.recordRuntimeSha256 || '', /^[a-f0-9]{64}$/u);
    assert.match(standalone.inkModuleSha256 || '', /^[a-f0-9]{64}$/u);
    const output = join(dirname(path), 'corridor-standalone.html');
    assert.equal(standalone.output, output, 'Journey must consume its own standalone artifact');
    for (const file of [output, `${output}.build.json`]) {
      const stat = lstatSync(file);
      assert(stat.isFile() && !stat.isSymbolicLink(), 'Journey output must be a real file');
    }
    const outputBytes = readFileSync(output);
    assert.equal(
      createHash('sha256').update(outputBytes).digest('hex'),
      standalone.standaloneSha256,
    );
    const html = outputBytes.toString('utf8');
    for (const [field, pattern] of [
      [
        'recordRuntimeSha256',
        /<script type="application\/octet-stream" id="standalone-record-module">([A-Za-z0-9+/]+={0,2})<\/script>/gu,
      ],
      [
        'inkModuleSha256',
        /^window\.__KAIRO_INK_URL__ = standaloneModuleUrl\("([A-Za-z0-9+/]+={0,2})"\);$/gmu,
      ],
    ]) {
      const matches = [...html.matchAll(pattern)];
      assert.equal(matches.length, 1, `Exactly one emitted ${field} payload is required`);
      const bytes = Buffer.from(matches[0][1], 'base64');
      assert.equal(
        bytes.toString('base64'),
        matches[0][1],
        'Embedded module encoding must be canonical',
      );
      assert.equal(createHash('sha256').update(bytes).digest('hex'), standalone[field], field);
    }
    assert.deepEqual(
      json(`${output}.build.json`),
      standalone,
      'Embedded and saved build receipts disagree',
    );
  } else if (type === 'native') {
    assert.equal(engine, 'chromium', 'Native reading gate requires the Chromium touch verifier');
    assert.equal(value.schemaVersion, 1);
    assert.equal(value.kind, 'native-bunki-readings-browser-verification');
    assert.equal(value.completed, true, 'Native reading journey was interrupted');
    assert.equal(value.pass, true);
    assert.match(artifactSha256 || '', /^[a-f0-9]{64}$/u);
    assert.equal(
      value.artifact?.artifactSha256,
      artifactSha256,
      'Native receipt belongs to another artifact',
    );
    assert.match(sourceSha256 || '', /^[a-f0-9]{64}$/u);
    assert.equal(
      value.verificationSources?.verifier,
      sourceSha256,
      'Native receipt belongs to another verifier',
    );
    assert.equal(value.touchEmulation, true);
    assert.deepEqual(value.viewport, { width: 390, height: 844 });
    assert.equal(typeof value.browser, 'string');
    assert(value.browser.length > 0, 'Native reading receipt has no browser version');
    assert(Array.isArray(value.results), 'No native reading results');
    requireNamedCases(
      value.results.map((row) => ({ ...row, name: nativeCaseIdentity(row) })),
      NATIVE_GATE_CASES.map(nativeCaseIdentity),
    );
    assert(Array.isArray(value.articles), 'No completed native articles');
    requireNamedCases(
      value.articles.map((row) => ({ ...row, name: row.id })),
      NATIVE_ARTICLE_IDS,
    );
    for (const article of value.articles)
      assert.deepEqual(
        article.dialCommit,
        {
          key: 'furigana',
          requested: 2,
          persisted: 2,
          acknowledgedReplacement: true,
          selected: true,
          enabled: true,
        },
        'Native article lacks the acknowledged dial change',
      );
    assert.deepEqual(value.failures, [], 'Native reading receipt reports failures');
    assert.deepEqual(value.noise, [], 'Native reading receipt reports browser errors');
  } else if (
    [
      'shelf-search',
      'record-note-views',
      'record-note-create',
      'record-note-lifecycle',
      'record-note-restore',
      'record-practice-finalize',
      'alma-reading',
      'prefetch-lifecycle',
    ].includes(type)
  ) {
    assert.deepEqual(engines, ['chromium', 'webkit'], 'This gate requires both supported engines');
    assert.deepEqual(
      value.engines,
      engines,
      'Receipt engine coverage differs from the required engines',
    );
    assert.match(artifactSha256 || '', /^[a-f0-9]{64}$/u);
    assert.match(sourceSha256 || '', /^[a-f0-9]{64}$/u);
    const search = type === 'shelf-search';
    const requiredCases = search
      ? SHELF_SEARCH_GATE_CASES
      : type === 'record-note-views'
        ? NOTE_VIEW_GATE_CASES
        : type === 'alma-reading'
          ? ALMA_READING_GATE_CASES
          : type === 'prefetch-lifecycle'
            ? PREFETCH_LIFECYCLE_GATE_CASES
            : type === 'record-note-lifecycle'
              ? NOTE_LIFECYCLE_GATE_CASES
              : type === 'record-note-restore'
                ? NOTE_RESTORE_GATE_CASES
                : type === 'record-practice-finalize'
                  ? PRACTICE_FINALIZE_GATE_CASES
                  : NOTE_CREATE_GATE_CASES;
    assert.equal(
      search ? value.artifact : value.artifactSha256,
      artifactSha256,
      'Receipt belongs to another artifact',
    );
    assert.equal(
      search ? value.sourceSha256 : value.verifierSha256,
      sourceSha256,
      'Receipt belongs to another verifier',
    );
    assert.equal(value.pass, true);
    assert.deepEqual(Object.keys(value.browserVersions || {}).sort(), [...engines].sort());
    assert(
      engines.every(
        (name) =>
          typeof value.browserVersions[name] === 'string' && value.browserVersions[name].length > 0,
      ),
    );
    assert(Array.isArray(value.results), 'No completed browser journeys');
    assert(
      value.results.every((row) => engines.includes(row.engine)),
      'Unexpected result engine',
    );
    for (const name of engines) {
      const rows = value.results.filter((row) => row.engine === name);
      requireNamedCases(rows, requiredCases);
      if (type === 'record-note-restore')
        assert.deepEqual(
          rows.map((row) => row.name),
          requiredCases,
        );
      if (search) {
        assert(
          rows.every((row) => Array.isArray(row.pageErrors) && row.pageErrors.length === 0),
          'Search receipt reports browser errors',
        );
        const measured = rows.find((row) => row.name === SHELF_SEARCH_GATE_CASES[0]).measurements;
        assert.equal(measured?.count, 10);
        assert.equal(measured.targetMs, 100);
        assert.equal(measured.comparator, '<');
        assert.equal(measured.debounceIncluded, true);
        assert(
          Number.isFinite(measured.p95Ms) && measured.p95Ms >= 0 && measured.p95Ms < 100,
          'Search lookup target was not met',
        );
      }
    }
    if (search) {
      assert.equal(value.schemaVersion, 1);
      assert.match(value.fixtureSha256 || '', /^[a-f0-9]{64}$/u);
    } else {
      assert.equal(value.suite, type);
      assert.equal(value.version, 1);
      assert.equal(value.mode, 'full', 'Browser gate rejects filtered journeys');
      assert.deepEqual(value.errors, [], 'Receipt reports browser errors');
      assert.deepEqual(value.externalRequests, [], 'Receipt reports external requests');
      if (
        [
          'alma-reading',
          'prefetch-lifecycle',
          'record-note-lifecycle',
          'record-note-restore',
          'record-practice-finalize',
        ].includes(type)
      )
        assert.equal(value.runtimeOverridden, false, 'Runtime overlays cannot pass product gates');
      if (type === 'record-practice-finalize')
        requirePracticeReceiptMetadata(value, practiceSource, receiptPath, engines);
      if (type === 'prefetch-lifecycle') {
        assert.equal(value.nativeFetchUnmodified, true, 'The lifecycle gate must use native fetch');
        requireNamedCases(value.contractResults, PREFETCH_LIFECYCLE_CONTRACT_CASES);
      }
      if (['record-note-lifecycle', 'record-note-restore'].includes(type)) {
        assert.deepEqual(
          value.runtimeOverrides,
          [],
          'Canonical note journeys cannot override runtime files',
        );
        assert.deepEqual(value.fatalErrors, [], 'Note lifecycle verifier reports fatal failures');
        assert.equal(value.exactCases, true);
        assert.equal(value.total, requiredCases.length * engines.length);
        assert.deepEqual(value.casesPerEngine, requiredCases);
      }
    }
  } else if (type === 'offline') {
    assert.match(
      artifactSha256 || '',
      /^[a-f0-9]{64}$/u,
      'Offline gate requires a verified artifact',
    );
    assert.equal(
      value.initialArtifactSha256,
      artifactSha256,
      'Offline receipt belongs to another artifact',
    );
    assert.equal(
      value.fixtureMode,
      'full-lifecycle',
      'Offline gate requires the complete lifecycle mode',
    );
    assert.match(value.initialSourceAssetSha256 || '', /^[a-f0-9]{64}$/u);
    assert.match(value.sourceHash || '', /^[a-f0-9]{64}$/u);
    assert.equal(
      value.workerVersion,
      `kairo-${value.initialSourceAssetSha256}`,
      'Offline receipt must describe the stamped release worker',
    );
    requireNamedCases(value.results, OFFLINE_GATE_CASES);
    assert.equal(value.failures, 0, 'Offline receipt reports failures');
    assert.deepEqual(value.browserErrors, [], 'Offline receipt reports browser errors');
  } else if (type === 'drift-hunt') {
    assert.equal(value.schemaVersion, 1);
    assert.equal(engine, 'chromium', 'Hunt gate requires Chromium touch/CDP coverage');
    assert.equal(value.engine, engine);
    assert.match(artifactSha256 || '', /^[a-f0-9]{64}$/u, 'Hunt gate requires a verified artifact');
    assert.equal(value.artifact, artifactSha256, 'Hunt receipt belongs to another artifact');
    assert.match(
      sourceSha256 || '',
      /^[a-f0-9]{64}$/u,
      'Hunt gate requires the invoked verifier identity',
    );
    assert.equal(
      value.sourceSha256,
      sourceSha256,
      'Hunt receipt belongs to another verifier source',
    );
    requireNamedCases(value.results, HUNT_GATE_CASES);
    assert.equal(value.pass, true);
    assert.deepEqual(value.errors, []);
  } else if (
    ['record-live', 'learning-record', 'drift-record', 'record-sync-backup'].includes(type)
  ) {
    assert(['chromium', 'webkit'].includes(engine), 'Record receipt needs a supported browser');
    assert.match(artifactSha256 || '', /^[a-f0-9]{64}$/u);
    assert.equal(
      value.artifactSha256,
      artifactSha256,
      'Record receipt belongs to another artifact',
    );
    if (type === 'record-live') {
      assert.equal(value.suite, 'record-live');
      assert.equal(value.browser?.name, engine);
      requireNamedCases(value.results, RECORD_GATE_CASES.record, 'status', 'passed');
      assert.equal(value.failures, 0);
      assert.deepEqual(value.pageErrors, []);
      assert.equal(value.externalRequestsSent, 0);
    } else if (type === 'learning-record') {
      assert.equal(value.format, 'kairo-learning-acknowledgment-tests');
      assert.equal(value.version, 1);
      requireNamedCases(value.results, [
        ...RECORD_GATE_CASES.learningControlled,
        ...RECORD_GATE_CASES.learningBrowser.map((name) => `${engine}: ${name}`),
      ]);
      assert.equal(value.pass, true);
    } else if (type === 'drift-record') {
      assert.equal(value.schemaVersion, 1);
      assert.deepEqual(value.engines, [engine]);
      requireNamedCases(value.results, RECORD_GATE_CASES.drift);
      assert(value.results.every((row) => row.engine === engine));
      assert.equal(value.pass, true);
    } else {
      assert.equal(value.suite, 'record-sync-backup');
      assert.equal(value.version, 1);
      assert.deepEqual(value.engines, [engine]);
      requireNamedCases(value.results, RECORD_GATE_CASES.syncBackup);
      assert(value.results.every((row) => row.engine === engine));
      assert.deepEqual(value.errors, []);
      assert.deepEqual(value.externalRequests, []);
      assert.equal(value.pass, true);
    }
  } else if (type === 'publisher') {
    assert.equal(value.format, 'kairo-publisher-reading-verification');
    assert.equal(value.v, 1);
    assert(['contracts', 'ui'].includes(mode));
    assert.equal(value.mode, mode);
    assert.match(artifactSha256 || '', /^[a-f0-9]{64}$/u);
    assert.equal(value.artifact?.sha256, artifactSha256);
    if (mode === 'ui') {
      assert.equal(value.observations?.runtime?.engine, engine);
      assert.equal(value.observations?.runtime?.protocol, 'https');
      assert.equal(value.observations?.runtime?.offlineFault, offlineFault);
    }
    const count = mode === 'ui' ? 8 : 12;
    assert(
      Array.isArray(value.results) && value.results.length === count,
      'Publisher coverage incomplete',
    );
    assert(value.results.every((row) => row.pass === true));
    assert.equal(value.passed, count);
    assert.equal(value.failed, 0);
  } else if (type === 'tutor-quiz') {
    assert.equal(value.format, 'kairo-tutor-quiz-storage-verification');
    assert.equal(value.v, 1);
    assert.equal(value.engine, engine);
    assert.match(artifactSha256 || '', /^[a-f0-9]{64}$/u);
    assert.equal(value.artifactSha256, artifactSha256);
    assert(
      Array.isArray(value.results) && value.results.length === 5,
      'Tutor quiz coverage incomplete',
    );
    assert(value.results.every((row) => row.pass === true));
    assert.deepEqual(value.errors, []);
    assert.deepEqual(value.external, []);
  } else if (type === 'practice') {
    assert.equal(value.format, 'kairo-practice-history-ui-verification');
    assert.equal(value.v, 1);
    assert.equal(value.runtime?.engine, engine);
    assert.equal(value.runtime?.protocol, 'https');
    assert.equal(value.runtime?.offlineFault, offlineFault);
    assert.match(
      artifactSha256 || '',
      /^[a-f0-9]{64}$/u,
      'Practice gate requires a verified artifact',
    );
    assert.equal(
      value.artifact?.sha256,
      artifactSha256,
      'Practice receipt belongs to another artifact',
    );
    assert(
      Array.isArray(value.results) && value.results.length === 6,
      'Practice journeys incomplete',
    );
    assert(value.results.every((row) => row.pass === true));
    assert.equal(value.passed, 6);
    assert.equal(value.failed, 0);
  } else if (type === 'drift') {
    assert.equal(value.gate?.status, 'pass');
    assert.equal(value.gate?.exitCode, 0);
    assert(Array.isArray(value.cases) && value.cases.length > 0);
    assert(value.cases.every((row) => row.outcome === 'ok'));
    assert.equal(value.totals?.total, value.cases.length);
    assert.equal(value.totals?.violations, 0);
    assert.equal(value.totals?.pageErrors, 0);
    assert.equal(value.fatalError, null);
    assert.equal(value.coverage?.matrix?.completedWords, value.coverage?.matrix?.requestedWords);
    assert.equal(value.coverage?.chain?.completedHops, value.coverage?.chain?.requestedHops);
    for (const seed of value.coverage.fuzz.seedsRequested) {
      assert.equal(value.coverage.fuzz.completedBySeed[seed], value.coverage.fuzz.gesturesPerSeed);
    }
  } else {
    throw new Error(`Unknown receipt contract: ${type}`);
  }
}

async function runGate(gate, root, out, signal) {
  const log = join(out, `${gate.name}.log`);
  const startedAt = now();
  writeFileSync(log, `${gate.command} ${gate.args.join(' ')}\n`);
  const finish = (status, exitCode, detail = '', processExitCode = null) => ({
    name: gate.name,
    status,
    exitCode,
    processExitCode,
    detail,
    log,
    startedAt,
    completedAt: now(),
  });
  if (gate.requiredPath && !existsSync(resolve(root, gate.requiredPath))) {
    return finish('missing', 127, `Required path is missing: ${gate.requiredPath}`);
  }
  const fd = openSync(log, 'a');
  let child;
  let timer;
  let killTimer;
  let killed = null;
  let stopPromise = Promise.resolve();
  const killGroup = (kind) => {
    if (!child?.pid) return;
    try {
      process.kill(process.platform === 'win32' ? child.pid : -child.pid, kind);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  const stop = (reason) => {
    if (killed) return;
    killed = reason;
    killGroup('SIGTERM');
    // A browser grandchild can outlive its parent and ignore TERM. Kill the
    // group after the grace period even when the direct child exits first.
    stopPromise = new Promise((accept) => {
      killTimer = setTimeout(() => {
        killGroup('SIGKILL');
        accept();
      }, 250);
    });
  };
  const abort = () => stop('interrupted');
  let result;
  try {
    result = await new Promise((accept) => {
      child = spawn(gate.command, gate.args, {
        cwd: resolve(root, gate.cwd || '.'),
        env: { ...process.env, ...gate.env },
        stdio: ['ignore', fd, fd],
        detached: process.platform !== 'win32',
      });
      child.once('error', (error) => accept({ error }));
      child.once('close', (code, processSignal) => accept({ code, processSignal }));
      timer = setTimeout(() => stop('timed-out'), timeoutMs(gate.timeoutMs));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
    clearTimeout(timer);
    await stopPromise;
  } finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
    signal?.removeEventListener('abort', abort);
    closeSync(fd);
  }
  if (killed)
    return finish(killed, killed === 'timed-out' ? 124 : 130, `Gate ${killed}`, result.code);
  if (result.error) return finish('missing', 127, result.error.message);
  if (result.code !== 0)
    return finish('failed', result.code || 1, result.processSignal || '', result.code);
  if (gate.report) {
    try {
      requireCompleteReport(gate.report);
    } catch (error) {
      return finish('incomplete', 78, error.message, 0);
    }
  }
  return finish('passed', 0, '', 0);
}

export async function runGates({ gates, root, out, source = null, signal }) {
  assert(gates.length > 0, 'An empty battery cannot pass');
  assert.equal(
    new Set(gates.map((gate) => gate.name)).size,
    gates.length,
    'Gate names must be unique',
  );
  for (const gate of gates) assert(/^[a-z][a-z0-9-]*$/.test(gate.name), 'Unsafe gate name');
  mkdirSync(out, { recursive: true });
  const receipt = {
    schemaVersion: 1,
    kind: 'kairo-required-battery',
    status: 'running',
    source,
    startedAt: now(),
    completedAt: null,
    exitCode: null,
    gates: gates.map(({ name }) => ({ name, status: 'pending' })),
  };
  const persist = () => {
    writeJson(join(out, 'battery.json'), receipt);
    const safe = (value) =>
      String(value ?? '')
        .replaceAll('|', '/')
        .replaceAll('\n', ' ');
    writeFileSync(
      join(out, 'SUMMARY.md'),
      [
        `# Battery — ${receipt.status}`,
        '',
        `Source: ${source?.sha || 'behavioral fixture'}; dirty: ${source?.dirty ?? 'fixture'}`,
        '',
        '| gate | status | exit | detail |',
        '| --- | --- | --- | --- |',
        ...receipt.gates.map(
          (gate) =>
            `| ${gate.name} | ${gate.status} | ${gate.exitCode ?? ''} | ${safe(gate.detail)} |`,
        ),
        '',
        `Started: ${receipt.startedAt}`,
        `Completed: ${receipt.completedAt || 'incomplete'}`,
        '',
      ].join('\n'),
    );
  };
  persist();
  for (const [index, gate] of gates.entries()) {
    if (signal?.aborted) break;
    receipt.gates[index] = { name: gate.name, status: 'running' };
    persist();
    receipt.gates[index] = await runGate(gate, root, out, signal);
    persist();
    console.log(
      `[battery] ${gate.name} -> ${receipt.gates[index].status} (${receipt.gates[index].exitCode})`,
    );
  }
  receipt.status = signal?.aborted
    ? 'interrupted'
    : receipt.gates.every((gate) => gate.status === 'passed')
      ? 'passed'
      : 'failed';
  receipt.exitCode = receipt.status === 'passed' ? 0 : receipt.status === 'interrupted' ? 130 : 1;
  receipt.completedAt = now();
  persist();
  return receipt;
}

async function verifyRunner(out) {
  const fixtures = join(out, 'fixtures');
  mkdirSync(fixtures, { recursive: true });
  const driver = join(fixtures, 'driver.mjs');
  writeFileSync(
    driver,
    `import { readFileSync } from 'node:fs';\nimport { runGates } from ${JSON.stringify(pathToFileURL(SELF).href)};\nconst config = JSON.parse(readFileSync(process.argv[2], 'utf8'));\nconst controller = new AbortController();\nif (config.interruptAfterMs) setTimeout(() => controller.abort(), config.interruptAfterMs);\nprocess.exitCode = (await runGates({...config, signal:controller.signal})).exitCode;\n`,
  );
  const invoke = (name, gates, interruptAfterMs) => {
    const evidence = join(out, name);
    const config = join(fixtures, `${name}.json`);
    writeJson(config, { root: fixtures, out: evidence, gates, interruptAfterMs });
    const child = spawnSync(process.execPath, [driver, config], {
      encoding: 'utf8',
      timeout: 15_000,
    });
    assert.ifError(child.error);
    return { child, receipt: json(join(evidence, 'battery.json')) };
  };
  const gate = (name, source, extra = {}) => ({
    name,
    command: process.execPath,
    args: ['-e', source],
    timeoutMs: 3000,
    ...extra,
  });
  const marker = join(fixtures, 'continued.txt');
  let result = invoke('all-pass', [gate('one', 'process.exit(0)'), gate('two', 'process.exit(0)')]);
  assert.equal(result.child.status, 0);
  assert.equal(result.receipt.status, 'passed');

  result = invoke('failure-continues', [
    gate('fails', 'process.exit(7)'),
    gate('later', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`),
  ]);
  assert.equal(result.child.status, 1);
  assert.equal(result.receipt.gates[0].processExitCode, 7);
  assert.equal(result.receipt.gates[1].status, 'passed');
  assert.equal(readFileSync(marker, 'utf8'), 'ran');

  result = invoke('missing-continues', [
    gate('missing-file', 'process.exit(0)', { requiredPath: 'missing-verifier.mjs' }),
    {
      name: 'missing-executable',
      command: join(fixtures, 'not-installed'),
      args: [],
      timeoutMs: 3000,
    },
    gate('later', 'process.exit(0)'),
  ]);
  assert.equal(result.child.status, 1);
  assert.deepEqual(
    result.receipt.gates.map((item) => item.status),
    ['missing', 'missing', 'passed'],
  );

  const requiredNames = [
    'reference-core',
    'reference-data',
    'reference-ui-contracts',
    'skip-core',
    'skip-ui-contracts',
    'kanji-capture',
    'navigation-returns',
    'reference-packaging',
    'skip-packaging',
    'reference-browser',
    'reference-connections',
    'skip-browser',
    'skip-standalone',
    'corridor-build',
    'corridor-lint',
    'desktop-host',
    'corridor',
    'corridor-a11y',
    'shelf-search',
    'record-note-views',
    'record-note-create',
    'record-note-lifecycle',
    'record-note-restore',
    'record-practice-finalize',
    'native-readings',
    'storage-integ',
    'record-integrity',
    'record-controller',
    'record-controller-webkit',
    'record-host',
    'record-host-webkit',
    'record-binding',
    'record-sync',
    'record-binding-browser',
    'record-binding-webkit',
    'record-app-chromium',
    'record-app-webkit',
    'record-sync-backup-chromium',
    'record-sync-backup-webkit',
    'record-live-chromium',
    'record-live-webkit',
    'learning-record-chromium',
    'learning-record-webkit',
    'drift-record-chromium',
    'drift-record-webkit',
    'drift-hunt',
    'corridor-ai',
    'teaching-context',
    'ai-adaptation',
    'search-fallback-core',
    'search-fallback-ui',
    'standalone-journey',
    'teacher-context-contract',
    'teacher-context-integration',
    'teacher-drafts-contract',
    'teacher-drafts-integration',
    'sentence-drafts-contract',
    'sentence-drafts-integration',
    'browser-audio-silence-contract',
    'source-kanji-practice-contract',
    'source-kanji-practice-integration',
    'source-inbox-contract',
    'source-learning-integration',
    'sentence-practice-integration',
    'sentence-feedback-integration',
    'bundled-practice-integration',
    'bundled-listening-integration',
    'bundled-listening-catalog',
    'bundled-listening-failures',
    'later-encounters-contracts',
    'later-encounters-integration',
    'source-processing-contract',
    'source-processing-integration',
    'tutor-request-binding-integration',
    'source-inbox-integration',
    'listening-intake-integration',
    'timed-transcript-integration',
    'reading-position-contract',
    'reading-position-integration',
    'mock',
    'assessment-controller',
    'practice-history',
    'practice-history-webkit',
    'kagami',
    'import-provider',
    'playback',
    'reading-candidates',
    'reading-candidates-webkit',
    'personal-reading',
    'personal-reading-webkit',
    'source-shelf',
    'source-shelf-webkit',
    'publisher-contracts',
    'alma-reading',
    'publisher-reading',
    'publisher-reading-webkit',
    'tutor-quiz-storage',
    'tutor-quiz-storage-webkit',
    'offline',
    'prefetch-lifecycle',
  ];
  const requiredGates = batteryGates(out).filter((item) => requiredNames.includes(item.name));
  assert.deepEqual(requiredGates.map((item) => item.name).sort(), [...requiredNames].sort());
  const pinnedGates = batteryGates(out, { KAIRO_VERIFIED_ARTIFACT_SHA256: 'e'.repeat(64) });
  assert(
    pinnedGates
      .find((item) => item.name === 'desktop-host')
      .args.includes('prototypes/bunki-desktop/test/publisher-alma.test.cjs'),
    'The desktop-host gate must execute ALMA native transport regressions',
  );
  assert(
    pinnedGates
      .find((item) => item.name === 'desktop-host')
      .args.includes('prototypes/bunki-desktop/test/native-rpc-byte-port.test.cjs'),
    'The desktop-host gate must execute native pipe regressions',
  );
  assert(
    pinnedGates
      .find((item) => item.name === 'desktop-host')
      .args.includes('prototypes/bunki-desktop/test/host-stage.test.cjs'),
    'The desktop-host gate must verify its shared generated runtime staging',
  );
  const offlineGate = pinnedGates.find((item) => item.name === 'offline');
  assert.deepEqual(offlineGate.report, {
    path: join(out, 'offline'),
    type: 'offline',
    artifactSha256: 'e'.repeat(64),
  });
  assert.deepEqual(offlineGate.args, ['prototypes/corridor/tools/verify-offline.mjs']);
  const huntGate = pinnedGates.find((item) => item.name === 'drift-hunt');
  assert.equal(huntGate.report.type, 'drift-hunt');
  assert.equal(huntGate.report.path, join(out, 'drift-hunt', 'drift-hunt-report.json'));
  assert.equal(huntGate.report.artifactSha256, 'e'.repeat(64));
  assert.equal(
    huntGate.report.sourceSha256,
    createHash('sha256')
      .update(readFileSync(join(ROOT, huntGate.requiredPath)))
      .digest('hex'),
  );
  assert.equal(huntGate.report.engine, 'chromium');
  assert.equal(huntGate.env.KAIRO_BROWSER, 'chromium');
  for (const [name, type, filename] of [
    ['shelf-search', 'shelf-search', 'shelf-search-report.json'],
    ['record-note-views', 'record-note-views', 'receipt.json'],
    ['record-note-create', 'record-note-create', 'receipt.json'],
    ['record-note-lifecycle', 'record-note-lifecycle', 'receipt.json'],
    ['record-note-restore', 'record-note-restore', 'receipt.json'],
    ['record-practice-finalize', 'record-practice-finalize', 'receipt.json'],
    ['alma-reading', 'alma-reading', 'receipt.json'],
    ['prefetch-lifecycle', 'prefetch-lifecycle', 'receipt.json'],
    ['native-readings', 'native', 'report.json'],
  ]) {
    const selected = pinnedGates.find((item) => item.name === name);
    assert.equal(selected.report.type, type);
    assert.equal(selected.report.path, join(out, name, filename));
    assert.equal(selected.report.artifactSha256, 'e'.repeat(64));
    assert.equal(
      selected.report.sourceSha256,
      createHash('sha256')
        .update(readFileSync(join(ROOT, selected.requiredPath)))
        .digest('hex'),
    );
    if (type === 'native') {
      assert.equal(selected.report.engine, 'chromium');
      assert.equal(selected.env.KAIRO_BROWSER, 'chromium');
    } else {
      assert.deepEqual(selected.report.engines, ['chromium', 'webkit']);
      assert.equal(selected.env.KAIRO_BROWSER, 'all');
      assert.deepEqual(
        selected.args,
        [selected.requiredPath],
        'Required gates cannot filter cases',
      );
    }
  }
  assert(
    pinnedGates.some((item) => item.name === 'drift-fast'),
    'Hunt must not replace the Drift matrix gate',
  );
  result = invoke('missing-real-verifiers', [...requiredGates, gate('later', 'process.exit(0)')]);
  assert.equal(result.child.status, 1);
  assert(result.receipt.gates.slice(0, -1).every((item) => item.status === 'missing'));
  assert.equal(result.receipt.gates.at(-1).status, 'passed');

  const pidFile = join(fixtures, 'orphan.pid');
  const grandchild = `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`;
  result = invoke('timeout-continues', [
    gate(
      'timeout',
      `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], {stdio:'ignore'}); setInterval(() => {}, 1000);`,
      { timeoutMs: 700 },
    ),
    gate('later', 'process.exit(0)'),
  ]);
  assert.equal(result.child.status, 1);
  assert.deepEqual(
    result.receipt.gates.map((item) => item.status),
    ['timed-out', 'passed'],
  );
  assert.equal(result.receipt.gates[0].exitCode, 124);
  const grandchildPid = Number(readFileSync(pidFile, 'utf8'));
  await delay(50);
  // Linux may retain a killed orphan as a zombie until init reaps it.
  const ps = spawnSync('ps', ['-o', 'stat=', '-p', String(grandchildPid)], { encoding: 'utf8' });
  assert(
    ps.status !== 0 || ps.stdout.trim().startsWith('Z'),
    'Timed-out gate left a running grandchild',
  );

  result = invoke(
    'interrupted',
    [gate('active', 'setInterval(() => {}, 1000)'), gate('later', 'process.exit(0)')],
    100,
  );
  assert.equal(result.child.status, 130);
  assert.equal(result.receipt.status, 'interrupted');
  assert.deepEqual(
    result.receipt.gates.map((item) => item.status),
    ['interrupted', 'pending'],
  );

  const missingReport = join(fixtures, 'not-written.json');
  const badReport = join(fixtures, 'incomplete.json');
  writeJson(badReport, { summary: { total: 2, failed: 0 }, results: [{ pass: true }] });
  result = invoke('incomplete-continues', [
    gate('missing-report', 'process.exit(0)', { report: { path: missingReport, type: 'checks' } }),
    gate('partial-report', 'process.exit(0)', { report: { path: badReport, type: 'checks' } }),
    gate('later', 'process.exit(0)'),
  ]);
  assert.equal(result.child.status, 1);
  assert.deepEqual(
    result.receipt.gates.map((item) => item.status),
    ['incomplete', 'incomplete', 'passed'],
  );

  const successReport = join(fixtures, 'complete.json');
  result = invoke('complete-receipt', [
    gate(
      'complete',
      `require('node:fs').writeFileSync(${JSON.stringify(successReport)}, JSON.stringify({summary:{total:1,failed:0},results:[{pass:true}]}))`,
      { report: { path: successReport, type: 'checks' } },
    ),
  ]);
  assert.equal(result.child.status, 0);

  const practicePath = join(fixtures, 'practice.json');
  const practiceSha = 'a'.repeat(64);
  const practiceReceipt = {
    format: 'kairo-practice-history-ui-verification',
    v: 1,
    runtime: { engine: 'webkit', protocol: 'https', offlineFault: 'server-disconnected' },
    artifact: { sha256: practiceSha },
    results: Array.from({ length: 6 }, () => ({ pass: true })),
    passed: 6,
    failed: 0,
  };
  const practiceReport = {
    path: practicePath,
    type: 'practice',
    engine: 'webkit',
    offlineFault: 'server-disconnected',
    artifactSha256: practiceSha,
  };
  writeJson(practicePath, practiceReceipt);
  result = invoke('practice-complete-receipt', [
    gate('practice', 'process.exit(0)', { report: practiceReport }),
  ]);
  assert.equal(result.child.status, 0);
  for (const [name, changed] of [
    ['engine', { runtime: { ...practiceReceipt.runtime, engine: 'chromium' } }],
    ['offline-fault', { runtime: { ...practiceReceipt.runtime, offlineFault: 'context-offline' } }],
    ['artifact', { artifact: { sha256: 'b'.repeat(64) } }],
    ['partial', { results: practiceReceipt.results.slice(0, 5), passed: 5 }],
  ]) {
    writeJson(practicePath, { ...practiceReceipt, ...changed });
    result = invoke(`practice-wrong-${name}`, [
      gate('practice', 'process.exit(0)', { report: practiceReport }),
    ]);
    assert.equal(result.child.status, 1);
    assert.equal(result.receipt.gates[0].status, 'incomplete');
  }

  for (const type of ['record-live', 'learning-record', 'drift-record', 'record-sync-backup']) {
    const artifactSha256 = 'c'.repeat(64);
    const engine = 'webkit';
    const path = join(fixtures, `${type}.json`);
    const cases =
      type === 'record-live'
        ? RECORD_GATE_CASES.record
        : type === 'drift-record'
          ? RECORD_GATE_CASES.drift
          : type === 'record-sync-backup'
            ? RECORD_GATE_CASES.syncBackup
            : [
                ...RECORD_GATE_CASES.learningControlled,
                ...RECORD_GATE_CASES.learningBrowser.map((name) => `${engine}: ${name}`),
              ];
    const fixture = {
      artifactSha256,
      pass: true,
      schemaVersion: 1,
      format: 'kairo-learning-acknowledgment-tests',
      version: 1,
      suite: type === 'record-sync-backup' ? 'record-sync-backup' : 'record-live',
      browser: { name: engine },
      engines: [engine],
      failures: 0,
      pageErrors: [],
      externalRequestsSent: 0,
      errors: [],
      externalRequests: [],
      results: cases.map((name) => ({ name, pass: true, engine, status: 'passed' })),
    };
    const report = { path, type, engine, artifactSha256 };
    writeJson(path, fixture);
    result = invoke(`${type}-complete`, [gate('record', 'process.exit(0)', { report })]);
    assert.equal(result.child.status, 0, `${type} complete receipt accepted`);
    const wrongEngine =
      type === 'learning-record'
        ? {
            results: fixture.results.map((row) => ({
              ...row,
              name: row.name.replace('webkit: ', 'chromium: '),
            })),
          }
        : { browser: { name: 'chromium' }, engines: ['chromium'] };
    for (const [name, changed] of [
      ['partial', { results: fixture.results.slice(1) }],
      ['duplicate', { results: [...fixture.results.slice(1), fixture.results[1]] }],
      [
        'failed',
        {
          results: fixture.results.map((row, index) =>
            index ? row : { ...row, pass: false, status: 'failed' },
          ),
        },
      ],
      ['artifact', { artifactSha256: 'd'.repeat(64) }],
      ['engine', wrongEngine],
    ]) {
      writeJson(path, { ...fixture, ...changed });
      result = invoke(`${type}-wrong-${name}`, [gate('record', 'process.exit(0)', { report })]);
      assert.equal(result.child.status, 1, `${type} ${name} receipt rejected`);
      assert.equal(result.receipt.gates[0].status, 'incomplete');
    }
  }

  const offlineArtifact = 'e'.repeat(64);
  const offlineSource = 'f'.repeat(64);
  const offlineFixture = {
    fixtureMode: 'full-lifecycle',
    initialArtifactSha256: offlineArtifact,
    initialSourceAssetSha256: offlineSource,
    sourceHash: 'a'.repeat(64),
    workerVersion: `kairo-${offlineSource}`,
    results: OFFLINE_GATE_CASES.map((name) => ({
      name,
      pass: true,
      detail: 'synthetic admission fixture',
    })),
    failures: 0,
    browserErrors: [],
  };
  const offlineAdmission = (
    name,
    fixture,
    prepare = () => {},
    artifactSha256 = offlineArtifact,
  ) => {
    const directory = join(fixtures, `offline-${name}`);
    const run = join(directory, 'run-synthetic');
    const path = join(run, 'receipt.json');
    mkdirSync(run, { recursive: true });
    writeJson(path, fixture);
    prepare({ directory, run, path });
    return invoke(`offline-${name}`, [
      gate('offline', 'process.exit(0)', {
        report: { path: directory, type: 'offline', artifactSha256 },
      }),
    ]);
  };
  result = offlineAdmission('complete', offlineFixture);
  assert.equal(result.child.status, 0, 'Complete offline lifecycle receipt accepted');
  for (const [name, changed] of [
    ['partial', { results: offlineFixture.results.slice(1) }],
    [
      'extra-case',
      { results: [...offlineFixture.results, { name: 'unrequested case', pass: true }] },
    ],
    [
      'duplicate-case',
      { results: [...offlineFixture.results.slice(1), offlineFixture.results[1]] },
    ],
    [
      'renamed-case',
      {
        results: offlineFixture.results.map((row, index) =>
          index ? row : { ...row, name: 'different journey' },
        ),
      },
    ],
    [
      'failed-case',
      {
        results: offlineFixture.results.map((row, index) =>
          index ? row : { ...row, pass: false },
        ),
      },
    ],
    [
      'unfinished-case',
      {
        results: offlineFixture.results.map((row, index) =>
          index ? row : { ...row, pass: 'true' },
        ),
      },
    ],
    ['artifact', { initialArtifactSha256: 'b'.repeat(64) }],
    ['missing-artifact', { initialArtifactSha256: undefined }],
    ['generation-only', { fixtureMode: 'generation-regressions' }],
    ['historical-only', { fixtureMode: 'historical-migration' }],
    ['negative-probe', { fixtureMode: 'negative-page-error-probe' }],
    ['missing-mode', { fixtureMode: undefined }],
    ['failure-count', { failures: 1 }],
    ['missing-failure-count', { failures: undefined }],
    ['browser-errors', { browserErrors: ['unexpected page error'] }],
    ['missing-browser-errors', { browserErrors: undefined }],
    ['unstamped-worker', { workerVersion: 'kairo-v2' }],
    ['source-shape', { sourceHash: 'unverified' }],
  ]) {
    result = offlineAdmission(`wrong-${name}`, { ...offlineFixture, ...changed });
    assert.equal(result.child.status, 1, `Offline ${name} receipt rejected`);
    assert.equal(result.receipt.gates[0].status, 'incomplete');
    assert.equal(result.receipt.gates[0].processExitCode, 0);
  }
  for (const [name, prepare] of [
    ['missing-receipt', ({ path }) => unlinkSync(path)],
    ['missing-run', ({ directory, run }) => renameSync(run, join(directory, 'not-a-run'))],
    ['missing-directory', ({ directory }) => renameSync(directory, `${directory}-moved`)],
    ['malformed-json', ({ path }) => writeFileSync(path, '{')],
    ['empty-json', ({ path }) => writeJson(path, {})],
    [
      'extra-run',
      ({ directory }) => {
        const second = join(directory, 'run-extra');
        mkdirSync(second);
        writeJson(join(second, 'receipt.json'), offlineFixture);
      },
    ],
    ['unfinished-extra-run', ({ directory }) => mkdirSync(join(directory, 'run-unfinished'))],
    [
      'symlink-run',
      ({ directory, run }) => {
        renameSync(run, join(directory, 'actual-run'));
        symlinkSync('actual-run', run, 'dir');
      },
    ],
    [
      'symlink-receipt',
      ({ run, path }) => {
        renameSync(path, join(run, 'actual-receipt.json'));
        symlinkSync('actual-receipt.json', path, 'file');
      },
    ],
    [
      'symlink-directory',
      ({ directory }) => {
        renameSync(directory, `${directory}-actual`);
        symlinkSync(`${directory}-actual`, directory, 'dir');
      },
    ],
  ]) {
    result = offlineAdmission(name, offlineFixture, prepare);
    assert.equal(result.child.status, 1, `Offline ${name} rejected`);
    assert.equal(result.receipt.gates[0].status, 'incomplete');
  }
  result = offlineAdmission('missing-expected-artifact', offlineFixture, () => {}, null);
  assert.equal(result.child.status, 1);
  assert.equal(result.receipt.gates[0].status, 'incomplete');

  const huntArtifact = 'b'.repeat(64);
  const huntSource = 'c'.repeat(64);
  const huntFixture = {
    schemaVersion: 1,
    engine: 'chromium',
    artifact: huntArtifact,
    sourceSha256: huntSource,
    results: HUNT_GATE_CASES.map((name) => ({
      name,
      pass: true,
      detail: 'synthetic admission fixture',
    })),
    pass: true,
    errors: [],
  };
  const huntAdmission = (name, fixture, expected = {}) => {
    const path = join(fixtures, `hunt-${name}.receipt.json`);
    if (fixture !== undefined) writeJson(path, fixture);
    return invoke(`hunt-${name}`, [
      gate('hunt', 'process.exit(0)', {
        report: {
          path,
          type: 'drift-hunt',
          engine: 'chromium',
          artifactSha256: huntArtifact,
          sourceSha256: huntSource,
          ...expected,
        },
      }),
    ]);
  };
  result = huntAdmission('complete', huntFixture);
  assert.equal(result.child.status, 0, 'Complete Hunt receipt accepted');
  for (const [name, changed] of [
    ['schema', { schemaVersion: 2 }],
    ['missing-schema', { schemaVersion: undefined }],
    ['engine', { engine: 'webkit' }],
    ['artifact', { artifact: 'd'.repeat(64) }],
    ['source', { sourceSha256: 'd'.repeat(64) }],
    ['missing-source', { sourceSha256: undefined }],
    ['partial', { results: huntFixture.results.slice(1) }],
    [
      'extra-case',
      { results: [...huntFixture.results, { name: 'extra touch journey', pass: true }] },
    ],
    ['duplicate-case', { results: [...huntFixture.results.slice(1), huntFixture.results[1]] }],
    [
      'renamed-case',
      {
        results: huntFixture.results.map((row, index) =>
          index ? row : { ...row, name: 'different gesture' },
        ),
      },
    ],
    [
      'failed-case',
      { results: huntFixture.results.map((row, index) => (index ? row : { ...row, pass: false })) },
    ],
    [
      'unfinished-case',
      {
        results: huntFixture.results.map((row, index) => (index ? row : { ...row, pass: 'true' })),
      },
    ],
    ['failed', { pass: false }],
    ['missing-pass', { pass: undefined }],
    ['errors', { errors: ['uncaught gesture error'] }],
    ['missing-errors', { errors: undefined }],
  ]) {
    result = huntAdmission(`wrong-${name}`, { ...huntFixture, ...changed });
    assert.equal(result.child.status, 1, `Hunt ${name} receipt rejected`);
    assert.equal(result.receipt.gates[0].status, 'incomplete');
    assert.equal(result.receipt.gates[0].processExitCode, 0);
  }
  for (const [name, expected] of [
    ['missing-expected-artifact', { artifactSha256: null }],
    ['missing-expected-source', { sourceSha256: null }],
    ['wrong-expected-engine', { engine: 'webkit' }],
  ]) {
    result = huntAdmission(name, huntFixture, expected);
    assert.equal(result.child.status, 1);
    assert.equal(result.receipt.gates[0].status, 'incomplete');
  }
  result = huntAdmission('missing-receipt', undefined);
  assert.equal(result.child.status, 1);
  assert.equal(result.receipt.gates[0].status, 'incomplete');

  // Exercise the real receipt consumer with successful child processes. A
  // zero exit cannot promote omitted journeys, stale identity, or browser errors.
  const scopedArtifact = 'a'.repeat(64);
  const scopedVerifier = 'b'.repeat(64);
  const bothEngines = ['chromium', 'webkit'];
  const nativeDial = {
    key: 'furigana',
    requested: 2,
    persisted: 2,
    acknowledgedReplacement: true,
    selected: true,
    enabled: true,
  };
  // Synthetic receipt-consumer fixtures use real source-derived identities but
  // confer no profile, lease or account authority.
  const practiceSite = join(fixtures, 'practice-source-fixture');
  const practiceHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const practiceFiles = [...PRACTICE_RUNTIME_PATHS, 'data/mock/sets/n5-01.json'].map((path) => {
    const bytes =
      path === 'record-host.mjs' || path === 'data/mock/sets/n5-01.json'
        ? readFileSync(join(ROOT, 'prototypes/corridor', path))
        : `// Synthetic source identity fixture: ${path}\n`;
    const file = join(practiceSite, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    const captured = readFileSync(file);
    return { path, bytes: captured.length, sha256: practiceHash(captured) };
  });
  const practiceArtifact = practiceHash(JSON.stringify(practiceFiles));
  writeJson(join(practiceSite, 'build-identity.json'), {
    artifactSha256: practiceArtifact,
    files: practiceFiles,
  });
  const practiceSources = practiceGateSourceMetadata(practiceSite, practiceArtifact);
  requirePracticeSourceMetadata(practiceSources);
  assert.throws(() => practiceGateSourceMetadata(practiceSite, '0'.repeat(64)), /artifact|equal/u);
  const practiceSourcePath = join(practiceSite, PRACTICE_RUNTIME_PATHS[0]);
  const practiceSourceBytes = readFileSync(practiceSourcePath);
  writeFileSync(practiceSourcePath, `${practiceSourceBytes}changed`);
  assert.throws(
    () => practiceGateSourceMetadata(practiceSite, practiceArtifact),
    /Practice source size differs/u,
  );
  writeFileSync(practiceSourcePath, practiceSourceBytes);
  const alteredSource = Buffer.from(practiceSourceBytes);
  alteredSource[0] ^= 1;
  writeFileSync(practiceSourcePath, alteredSource);
  assert.throws(
    () => practiceGateSourceMetadata(practiceSite, practiceArtifact),
    /Practice source identity differs/u,
  );
  writeFileSync(practiceSourcePath, practiceSourceBytes);
  const practiceResults = bothEngines.flatMap((engine) =>
    PRACTICE_FINALIZE_GATE_CASES.map((name) => {
      const path = join(fixtures, engine, name, 'evidence.json');
      mkdirSync(dirname(path), { recursive: true });
      writeJson(path, { syntheticReceiptFixture: true, engine, name });
      return {
        engine,
        name,
        pass: true,
        elapsedMs: 1,
        evidence: { path, sha256: practiceHash(readFileSync(path)) },
      };
    }),
  );
  const scopedFixtures = {
    'record-practice-finalize': {
      suite: 'record-practice-finalize',
      version: 1,
      mode: 'full',
      runtimeOverridden: false,
      diagnosticRoot: false,
      ...practiceSources,
      artifactSha256: scopedArtifact,
      verifierSha256: scopedVerifier,
      engines: bothEngines,
      browserVersions: { chromium: '153.0.8010.12', webkit: '26.6' },
      pass: true,
      results: practiceResults,
      errors: [],
      externalRequests: [],
    },
    'record-note-lifecycle': {
      suite: 'record-note-lifecycle',
      version: 1,
      mode: 'full',
      runtimeOverridden: false,
      runtimeOverrides: [],
      fatalErrors: [],
      exactCases: true,
      total: NOTE_LIFECYCLE_GATE_CASES.length * bothEngines.length,
      casesPerEngine: NOTE_LIFECYCLE_GATE_CASES,
      artifactSha256: scopedArtifact,
      verifierSha256: scopedVerifier,
      engines: bothEngines,
      browserVersions: { chromium: '153.fixture', webkit: '26.fixture' },
      pass: true,
      results: bothEngines.flatMap((engine) =>
        NOTE_LIFECYCLE_GATE_CASES.map((name) => ({ engine, name, pass: true })),
      ),
      errors: [],
      externalRequests: [],
    },
    'record-note-restore': {
      suite: 'record-note-restore',
      version: 1,
      mode: 'full',
      runtimeOverridden: false,
      runtimeOverrides: [],
      fatalErrors: [],
      exactCases: true,
      total: NOTE_RESTORE_GATE_CASES.length * bothEngines.length,
      casesPerEngine: NOTE_RESTORE_GATE_CASES,
      artifactSha256: scopedArtifact,
      verifierSha256: scopedVerifier,
      engines: bothEngines,
      browserVersions: { chromium: '153.fixture', webkit: '26.fixture' },
      pass: true,
      results: bothEngines.flatMap((engine) =>
        NOTE_RESTORE_GATE_CASES.map((name) => ({ engine, name, pass: true })),
      ),
      errors: [],
      externalRequests: [],
    },
    'prefetch-lifecycle': {
      suite: 'prefetch-lifecycle',
      version: 1,
      mode: 'full',
      runtimeOverridden: false,
      nativeFetchUnmodified: true,
      contractResults: PREFETCH_LIFECYCLE_CONTRACT_CASES.map((name) => ({ name, pass: true })),
      artifactSha256: scopedArtifact,
      verifierSha256: scopedVerifier,
      engines: bothEngines,
      browserVersions: { chromium: '153.fixture', webkit: '26.fixture' },
      pass: true,
      results: bothEngines.flatMap((engine) =>
        PREFETCH_LIFECYCLE_GATE_CASES.map((name) => ({ engine, name, pass: true })),
      ),
      errors: [],
      externalRequests: [],
    },
    'alma-reading': {
      suite: 'alma-reading',
      version: 1,
      mode: 'full',
      runtimeOverridden: false,
      artifactSha256: scopedArtifact,
      verifierSha256: scopedVerifier,
      engines: bothEngines,
      browserVersions: { chromium: '153.fixture', webkit: '26.fixture' },
      pass: true,
      results: bothEngines.flatMap((engine) =>
        ALMA_READING_GATE_CASES.map((name) => ({ engine, name, pass: true })),
      ),
      errors: [],
      externalRequests: [],
    },
    'shelf-search': {
      schemaVersion: 1,
      artifact: scopedArtifact,
      sourceSha256: scopedVerifier,
      fixtureSha256: 'c'.repeat(64),
      engines: bothEngines,
      browserVersions: { chromium: '153.fixture', webkit: '26.fixture' },
      pass: true,
      results: bothEngines.flatMap((engine) =>
        SHELF_SEARCH_GATE_CASES.map((name, index) => ({
          engine,
          name,
          pass: true,
          pageErrors: [],
          ...(index === 0
            ? {
                measurements: {
                  count: 10,
                  targetMs: 100,
                  comparator: '<',
                  debounceIncluded: true,
                  p95Ms: 12,
                },
              }
            : {}),
        })),
      ),
    },
    'record-note-views': {
      suite: 'record-note-views',
      version: 1,
      mode: 'full',
      artifactSha256: scopedArtifact,
      verifierSha256: scopedVerifier,
      engines: bothEngines,
      browserVersions: { chromium: '153.fixture', webkit: '26.fixture' },
      pass: true,
      results: bothEngines.flatMap((engine) =>
        NOTE_VIEW_GATE_CASES.map((name) => ({
          engine,
          name,
          pass: true,
        })),
      ),
      errors: [],
      externalRequests: [],
    },
    'record-note-create': {
      suite: 'record-note-create',
      version: 1,
      mode: 'full',
      artifactSha256: scopedArtifact,
      verifierSha256: scopedVerifier,
      engines: bothEngines,
      browserVersions: { chromium: '153.fixture', webkit: '26.fixture' },
      pass: true,
      results: bothEngines.flatMap((engine) =>
        NOTE_CREATE_GATE_CASES.map((name) => ({
          engine,
          name,
          pass: true,
        })),
      ),
      errors: [],
      externalRequests: [],
    },
    native: {
      schemaVersion: 1,
      kind: 'native-bunki-readings-browser-verification',
      completed: true,
      pass: true,
      touchEmulation: true,
      viewport: { width: 390, height: 844 },
      browser: '153.fixture',
      artifact: { artifactSha256: scopedArtifact },
      verificationSources: { verifier: scopedVerifier },
      results: NATIVE_GATE_CASES.map((row) => ({ ...row, pass: true })),
      articles: NATIVE_ARTICLE_IDS.map((id) => ({ id, pass: true, dialCommit: nativeDial })),
      failures: [],
      noise: [],
    },
  };
  const scopedAdmission = (type, name, fixture, expected = {}) => {
    const path = join(fixtures, `${type}-admission-${name}.receipt.json`);
    if (fixture !== undefined) writeJson(path, fixture);
    return invoke(`${type}-admission-${name}`, [
      gate(type, 'process.exit(0)', {
        report: {
          path,
          type,
          artifactSha256: scopedArtifact,
          sourceSha256: scopedVerifier,
          ...(type === 'native' ? { engine: 'chromium' } : { engines: bothEngines }),
          ...(type === 'record-practice-finalize' ? { practiceSource: practiceSources } : {}),
          ...expected,
        },
      }),
    ]);
  };
  for (const [type, fixture] of Object.entries(scopedFixtures)) {
    result = scopedAdmission(type, 'complete', fixture);
    assert.equal(result.child.status, 0, `${type} complete receipt accepted`);
    const firstRow = (change) =>
      fixture.results.map((row, index) => (index ? row : { ...row, ...change }));
    const artifactField =
      type === 'native'
        ? { artifact: { artifactSha256: 'd'.repeat(64) } }
        : type === 'shelf-search'
          ? { artifact: 'd'.repeat(64) }
          : { artifactSha256: 'd'.repeat(64) };
    const sourceField = (sha) =>
      type === 'native'
        ? { verificationSources: { verifier: sha } }
        : type === 'shelf-search'
          ? { sourceSha256: sha }
          : { verifierSha256: sha };
    const browserErrors = (errors) =>
      type === 'native'
        ? { noise: errors }
        : type === 'shelf-search'
          ? { results: firstRow({ pageErrors: errors }) }
          : { errors };
    const mutations = [
      ['missing-results', { results: undefined }],
      ['empty-results', { results: [] }],
      ['partial', { results: fixture.results.slice(1) }],
      ['duplicate', { results: [...fixture.results.slice(1), fixture.results[1]] }],
      ['renamed', { results: firstRow({ name: 'different journey' }) }],
      ['failed-result', { results: firstRow({ pass: false }) }],
      ['unfinished-result', { results: firstRow({ pass: 'true' }) }],
      ['failed', { pass: false }],
      ['missing-pass', { pass: undefined }],
      ['artifact', artifactField],
      ['verifier', sourceField('d'.repeat(64))],
      ['missing-verifier', sourceField(undefined)],
      ['browser-errors', browserErrors(['unexpected browser error'])],
      ['missing-error-list', browserErrors(undefined)],
    ];
    if (
      [
        'alma-reading',
        'prefetch-lifecycle',
        'record-note-lifecycle',
        'record-note-restore',
        'record-practice-finalize',
      ].includes(type)
    ) {
      mutations.push(
        ['runtime-override', { runtimeOverridden: true }],
        ['missing-runtime-identity', { runtimeOverridden: undefined }],
      );
    }
    if (['record-note-lifecycle', 'record-note-restore'].includes(type)) {
      mutations.push(
        ['declared-runtime-overrides', { runtimeOverrides: [{ path: 'corridor.js' }] }],
        ['missing-runtime-overrides', { runtimeOverrides: undefined }],
        ['fatal-errors', { fatalErrors: ['fixture failure'] }],
        ['missing-fatal-errors', { fatalErrors: undefined }],
        ['inexact-cases', { exactCases: false }],
        ['missing-case-catalog', { casesPerEngine: undefined }],
        ['partial-case-catalog', { casesPerEngine: fixture.casesPerEngine.slice(1) }],
        ['wrong-case-total', { total: fixture.total - 1 }],
      );
    }
    if (['record-note-restore', 'record-practice-finalize'].includes(type))
      mutations.push(['reordered-results', { results: [...fixture.results].reverse() }]);
    if (type === 'prefetch-lifecycle') {
      mutations.push(
        ['modified-fetch', { nativeFetchUnmodified: false }],
        ['missing-fetch-identity', { nativeFetchUnmodified: undefined }],
        ['missing-contracts', { contractResults: undefined }],
        ['partial-contracts', { contractResults: fixture.contractResults.slice(1) }],
        [
          'failed-contract',
          {
            contractResults: fixture.contractResults.map((row, index) =>
              index ? row : { ...row, pass: false },
            ),
          },
        ],
        [
          'duplicate-contract',
          { contractResults: [...fixture.contractResults.slice(1), fixture.contractResults[1]] },
        ],
      );
    }
    if (type === 'native') {
      mutations.push(
        ['schema', { schemaVersion: 2 }],
        ['kind', { kind: 'other-reading-suite' }],
        ['interrupted', { completed: false }],
        ['missing-completed', { completed: undefined }],
        ['reported-failures', { failures: ['browser harness'] }],
        ['missing-failures', { failures: undefined }],
        ['missing-browser', { browser: undefined }],
        ['wrong-article-id', { results: firstRow({ articleId: 'unrelated-article' }) }],
        ['missing-article-id', { results: firstRow({ articleId: undefined }) }],
        ['partial-articles', { articles: fixture.articles.slice(1) }],
        ['duplicate-articles', { articles: [...fixture.articles.slice(1), fixture.articles[1]] }],
        [
          'failed-article',
          {
            articles: fixture.articles.map((row, index) => (index ? row : { ...row, pass: false })),
          },
        ],
        [
          'unacknowledged-dial',
          {
            articles: fixture.articles.map((row, index) =>
              index
                ? row
                : { ...row, dialCommit: { ...nativeDial, acknowledgedReplacement: false } },
            ),
          },
        ],
      );
    } else {
      mutations.push(
        ['wrong-engines', { engines: ['chromium'] }],
        ['duplicate-engines', { engines: ['chromium', 'chromium'] }],
        ['wrong-result-engine', { results: firstRow({ engine: 'firefox' }) }],
        ['missing-browser-version', { browserVersions: { chromium: '153.fixture' } }],
      );
      if (type !== 'shelf-search')
        mutations.push(
          ['schema', { version: 2 }],
          ['suite', { suite: 'other-record-suite' }],
          ['filtered', { mode: 'filtered' }],
          ['missing-mode', { mode: undefined }],
          ['external-requests', { externalRequests: ['https://unexpected.invalid'] }],
          ['missing-external-requests', { externalRequests: undefined }],
        );
      else
        mutations.push(
          ['schema', { schemaVersion: 2 }],
          ['missing-fixture-identity', { fixtureSha256: undefined }],
          ['missing-measurements', { results: firstRow({ measurements: undefined }) }],
          [
            'missed-latency-target',
            {
              results: firstRow({
                measurements: { ...fixture.results[0].measurements, p95Ms: 100 },
              }),
            },
          ],
          [
            'relaxed-latency-target',
            {
              results: firstRow({
                measurements: { ...fixture.results[0].measurements, targetMs: 150 },
              }),
            },
          ],
          [
            'subtracted-debounce',
            {
              results: firstRow({
                measurements: { ...fixture.results[0].measurements, debounceIncluded: false },
              }),
            },
          ],
        );
    }
    if (
      [
        'record-note-create',
        'record-note-lifecycle',
        'record-note-restore',
        'record-practice-finalize',
        'alma-reading',
        'prefetch-lifecycle',
      ].includes(type)
    )
      mutations.push(
        [
          'extra-result',
          { results: [...fixture.results, { ...fixture.results[0], name: 'extra journey' }] },
        ],
        [
          'missing-engine-results',
          { results: fixture.results.filter((row) => row.engine === 'chromium') },
        ],
        ['missing-engines', { engines: undefined }],
        ['empty-browser-version', { browserVersions: { chromium: '153.fixture', webkit: '' } }],
        ['truthy-pass', { pass: 'true' }],
        ['missing-artifact', { artifactSha256: undefined }],
      );
    if (type === 'record-practice-finalize') {
      const input = (change) =>
        fixture.runtimeInputs.map((row, index) => (index ? row : { ...row, ...change }));
      const control = (change) =>
        fixture.authoredNegativeHostMutations.map((row, index) =>
          index ? row : { ...row, ...change },
        );
      mutations.push(
        ['diagnostic-root', { diagnosticRoot: true }],
        ['missing-diagnostic-root', { diagnosticRoot: undefined }],
        [
          'reordered-engine-blocks',
          { results: [...fixture.results.slice(34), ...fixture.results.slice(0, 34)] },
        ],
        [
          'invented-browser-version',
          { browserVersions: { chromium: '153.fixture', webkit: '26.6' } },
        ],
        [
          'extra-browser-version',
          { browserVersions: { ...fixture.browserVersions, firefox: '1.0' } },
        ],
        ['missing-runtime-inputs', { runtimeInputs: undefined }],
        ['empty-runtime-inputs', { runtimeInputs: [] }],
        ['partial-runtime-inputs', { runtimeInputs: fixture.runtimeInputs.slice(1) }],
        [
          'extra-runtime-input',
          {
            runtimeInputs: [
              ...fixture.runtimeInputs,
              { ...fixture.runtimeInputs[0], path: 'extra.mjs' },
            ],
          },
        ],
        [
          'duplicate-runtime-input',
          { runtimeInputs: [...fixture.runtimeInputs.slice(1), fixture.runtimeInputs[1]] },
        ],
        ['reordered-runtime-inputs', { runtimeInputs: [...fixture.runtimeInputs].reverse() }],
        ['wrong-runtime-path', { runtimeInputs: input({ path: 'external/corridor.js' }) }],
        ['wrong-runtime-hash', { runtimeInputs: input({ sha256: '0'.repeat(64) }) }],
        ['missing-runtime-hash', { runtimeInputs: input({ sha256: undefined }) }],
        [
          'wrong-runtime-size',
          { runtimeInputs: input({ bytes: fixture.runtimeInputs[0].bytes + 1 }) },
        ],
        ['invalid-runtime-size', { runtimeInputs: input({ bytes: 0 }) }],
        ['missing-runtime-size', { runtimeInputs: input({ bytes: undefined }) }],
        ['overridden-runtime-input', { runtimeInputs: input({ overridden: true }) }],
        ['missing-runtime-override-state', { runtimeInputs: input({ overridden: undefined }) }],
        ['extra-runtime-metadata', { runtimeInputs: input({ unrelated: true }) }],
        ['missing-fixture', { fixture: undefined }],
        ['wrong-fixture-hash', { fixture: { ...fixture.fixture, setSha256: '0'.repeat(64) } }],
        [
          'wrong-subset-hash',
          { fixture: { ...fixture.fixture, syntheticSubsetSha256: '0'.repeat(64) } },
        ],
        ['missing-fixture-hash', { fixture: { ...fixture.fixture, setSha256: undefined } }],
        [
          'missing-subset-hash',
          { fixture: { ...fixture.fixture, syntheticSubsetSha256: undefined } },
        ],
        [
          'account-authority-claim',
          { fixture: { ...fixture.fixture, authorization: 'account-authorized' } },
        ],
        [
          'missing-fixture-authority',
          { fixture: { ...fixture.fixture, authorization: undefined } },
        ],
        ['missing-controls', { authoredNegativeHostMutations: undefined }],
        [
          'partial-controls',
          { authoredNegativeHostMutations: fixture.authoredNegativeHostMutations.slice(1) },
        ],
        [
          'extra-control',
          {
            authoredNegativeHostMutations: [
              ...fixture.authoredNegativeHostMutations,
              { ...fixture.authoredNegativeHostMutations[0], name: 'extra-control' },
            ],
          },
        ],
        [
          'duplicate-control',
          {
            authoredNegativeHostMutations: [
              ...fixture.authoredNegativeHostMutations.slice(1),
              fixture.authoredNegativeHostMutations[1],
            ],
          },
        ],
        [
          'reordered-controls',
          { authoredNegativeHostMutations: [...fixture.authoredNegativeHostMutations].reverse() },
        ],
        [
          'wrong-control-name',
          { authoredNegativeHostMutations: control({ name: 'different-control' }) },
        ],
        [
          'wrong-control-hash',
          { authoredNegativeHostMutations: control({ sha256: '0'.repeat(64) }) },
        ],
        ['missing-control-hash', { authoredNegativeHostMutations: control({ sha256: undefined }) }],
        [
          'wrong-original-host',
          { authoredNegativeHostMutations: control({ originalSha256: '0'.repeat(64) }) },
        ],
        [
          'missing-original-host',
          { authoredNegativeHostMutations: control({ originalSha256: undefined }) },
        ],
        [
          'unchanged-control',
          {
            authoredNegativeHostMutations: control({
              sha256: fixture.authoredNegativeHostMutations[0].originalSha256,
            }),
          },
        ],
        ['missing-evidence', { results: firstRow({ evidence: undefined }) }],
        ['empty-evidence', { results: firstRow({ evidence: {} }) }],
        [
          'evidence-missing-hash',
          { results: firstRow({ evidence: { path: fixture.results[0].evidence.path } }) },
        ],
        [
          'evidence-wrong-hash',
          {
            results: firstRow({
              evidence: { ...fixture.results[0].evidence, sha256: '0'.repeat(64) },
            }),
          },
        ],
        [
          'evidence-relative-path',
          {
            results: firstRow({
              evidence: { ...fixture.results[0].evidence, path: 'evidence.json' },
            }),
          },
        ],
        ['evidence-other-case', { results: firstRow({ evidence: fixture.results[1].evidence }) }],
        [
          'evidence-extra-metadata',
          { results: firstRow({ evidence: { ...fixture.results[0].evidence, unrelated: true } }) },
        ],
        ['missing-elapsed', { results: firstRow({ elapsedMs: undefined }) }],
        ['negative-elapsed', { results: firstRow({ elapsedMs: -1 }) }],
        ['fractional-elapsed', { results: firstRow({ elapsedMs: 0.5 }) }],
        ['extra-result-metadata', { results: firstRow({ unfinished: true }) }],
      );
    }
    for (const [name, changed] of mutations) {
      result = scopedAdmission(type, name, { ...fixture, ...changed });
      assert.equal(result.child.status, 1, `${type} ${name} rejected`);
      assert.equal(result.receipt.gates[0].status, 'incomplete');
      assert.equal(result.receipt.gates[0].processExitCode, 0);
    }
    for (const [name, expected] of [
      ['missing-expected-artifact', { artifactSha256: null }],
      ['missing-expected-verifier', { sourceSha256: null }],
      [
        'wrong-expected-engine',
        type === 'native' ? { engine: 'webkit' } : { engines: ['chromium'] },
      ],
    ]) {
      result = scopedAdmission(type, name, fixture, expected);
      assert.equal(result.child.status, 1, `${type} ${name} rejected`);
      assert.equal(result.receipt.gates[0].status, 'incomplete');
    }
    result = scopedAdmission(type, 'missing-receipt', undefined);
    assert.equal(result.child.status, 1);
    assert.equal(result.receipt.gates[0].status, 'incomplete');
  }

  const practiceFixture = scopedFixtures['record-practice-finalize'];
  const rejectedPractice = (name, fixture, expected) => {
    const run = scopedAdmission('record-practice-finalize', name, fixture, expected);
    assert.equal(run.child.status, 1, `Practice ${name} rejected`);
    assert.equal(run.receipt.gates[0].status, 'incomplete');
    assert.equal(run.receipt.gates[0].processExitCode, 0);
  };
  for (const [name, practiceSource] of [
    ['missing-expected-source-metadata', undefined],
    ['null-expected-source-metadata', null],
    [
      'partial-expected-source-metadata',
      { ...practiceSources, runtimeInputs: practiceSources.runtimeInputs.slice(1) },
    ],
    [
      'overridden-expected-source-metadata',
      {
        ...practiceSources,
        runtimeInputs: practiceSources.runtimeInputs.map((row) => ({ ...row, overridden: true })),
      },
    ],
    [
      'wrong-expected-source-metadata',
      { ...practiceSources, fixture: { ...practiceSources.fixture, setSha256: '0'.repeat(64) } },
    ],
  ])
    rejectedPractice(name, practiceFixture, { practiceSource });
  const evidenceFile = practiceFixture.results[0].evidence.path;
  const evidenceBytes = readFileSync(evidenceFile);
  unlinkSync(evidenceFile);
  rejectedPractice('missing-evidence-file', practiceFixture);
  writeFileSync(evidenceFile, evidenceBytes);
  writeFileSync(evidenceFile, 'changed evidence');
  rejectedPractice('changed-evidence-file', practiceFixture);
  for (const [name, content] of [
    ['malformed', '{'],
    ['empty', '{}'],
    ['array', '[]'],
    ['null', 'null'],
  ]) {
    writeFileSync(evidenceFile, content);
    const results = practiceFixture.results.map((row, index) =>
      index ? row : { ...row, evidence: { path: evidenceFile, sha256: practiceHash(content) } },
    );
    rejectedPractice(`${name}-evidence-file`, { ...practiceFixture, results });
  }
  writeFileSync(evidenceFile, evidenceBytes);
  renameSync(evidenceFile, `${evidenceFile}.held`);
  symlinkSync(`${evidenceFile}.held`, evidenceFile);
  rejectedPractice('symlink-evidence-file', practiceFixture);
  unlinkSync(evidenceFile);
  renameSync(`${evidenceFile}.held`, evidenceFile);
  const evidenceDirectory = dirname(evidenceFile);
  renameSync(evidenceDirectory, `${evidenceDirectory}.held`);
  symlinkSync(`${evidenceDirectory}.held`, evidenceDirectory);
  rejectedPractice('symlink-evidence-directory', practiceFixture);
  unlinkSync(evidenceDirectory);
  renameSync(`${evidenceDirectory}.held`, evidenceDirectory);
  result = scopedAdmission('record-practice-finalize', 'restored-complete', practiceFixture);
  assert.equal(
    result.child.status,
    0,
    'Practice intact evidence remains accepted after negative controls',
  );

  // Execute the real shell entry point; reject tracked output before any gate.
  const wrapper = spawnSync('bash', ['docs/build-evidence/renkan/battery.sh', ROOT], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.notEqual(wrapper.status, 0);
  assert(wrapper.stderr.includes('Evidence must not be written into the checkout'));
  return [
    'successful children',
    'failure aggregation and continuation',
    'missing required paths and executables',
    'missing actual runtime verifiers fail without skipping',
    'timeout and grandchild cleanup',
    'cancellation preserves interrupted and unrun outcomes',
    'missing and incomplete receipts',
    'completed receipt acceptance',
    'practice engine, offline fault, artifact identity and complete journeys',
    'record, learning and Drift receipts require exact cases, browser and artifact',
    'offline gate requires one real run receipt, full lifecycle, exact cases, artifact and no failures',
    'Hunt gate retains Drift matrix coverage and requires exact cases, schema, Chromium, artifact and verifier source',
    'shelf-search requires both engines, all exact cases, strict latency, artifact and verifier identity',
    'record note views require full mode, both engines, all exact cases and clean browser receipts',
    'record note creation requires full mode,18 exact cases across both engines, artifact and verifier identity and no browser noise',
    'native readings require completed pass,55 article-aware checks,30 acknowledged articles and exact identity',
    'practice finalization requires68 ordered cases, pinned runtime and verifier identities, six synthetic controls and intact local evidence in both engines',
    'real shell rejects tracked output',
  ];
}

function verifyArtifactFailures(out) {
  const site = join(out, 'artifact-fixture');
  execFileSync(process.execPath, ['scripts/build-corridor-site.mjs', '--out', site], {
    cwd: ROOT,
    stdio: 'pipe',
  });
  const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const index = readFileSync(join(site, 'index.html'));
  const worker = readFileSync(join(ROOT, 'prototypes/corridor/sw.js'));
  const stamped = readFileSync(join(site, 'sw.js'));
  const manifest = json(join(site, 'build-identity.json'));
  manifest.sourceDirty = true; // Exercise this control even on a clean CI checkout.
  const saveManifest = () => {
    manifest.files = manifest.files.map(({ path }) => {
      const bytes = readFileSync(join(site, path));
      return { path, bytes: bytes.length, sha256: sha256(bytes) };
    });
    manifest.artifactSha256 = sha256(JSON.stringify(manifest.files));
    writeJson(join(site, 'build-identity.json'), manifest);
  };
  const invoke = (...args) =>
    spawnSync(process.execPath, [SELF, '--verify-artifact', site, ...args], {
      encoding: 'utf8',
      timeout: 30_000,
    });
  saveManifest();
  let run = invoke();
  assert.equal(run.status, 0, run.stderr);
  const results = [{ case: 'intact stamped bytes', exitCode: run.status }];
  run = invoke('--require-clean');
  assert.equal(run.status, 1, run.stderr || String(run.error));
  assert.match(run.stderr, /dirty source build cannot publish/u);
  results.push({ case: 'dirty build cannot publish', exitCode: run.status });
  writeFileSync(join(site, 'index.html'), 'changed after testing');
  run = invoke();
  assert.equal(run.status, 1, run.stderr || String(run.error));
  results.push({ case: 'changed file cannot match manifest', exitCode: run.status });
  saveManifest();
  run = invoke();
  assert.equal(run.status, 1, run.stderr || String(run.error));
  results.push({ case: 'rewritten manifest cannot conceal source mismatch', exitCode: run.status });
  writeFileSync(join(site, 'index.html'), index);
  writeFileSync(join(site, 'sw.js'), worker); // Original worker is not the stamped artifact.
  saveManifest();
  run = invoke();
  assert.equal(run.status, 1, run.stderr || String(run.error));
  results.push({ case: 'unstamped service worker cannot publish', exitCode: run.status });
  writeFileSync(join(site, 'sw.js'), stamped);
  saveManifest();
  const modulePath = join(site, 'modules/reading-core.mjs');
  const moduleBytes = readFileSync(modulePath);
  unlinkSync(modulePath);
  run = invoke();
  assert.equal(run.status, 1, run.stderr || String(run.error));
  results.push({ case: 'missing compiled module cannot pass', exitCode: run.status });
  writeFileSync(
    modulePath,
    Buffer.concat([moduleBytes, Buffer.from('\nexport const staleModuleFixture = true;\n')]),
  );
  saveManifest();
  run = invoke();
  assert.equal(run.status, 1, run.stderr || String(run.error));
  assert.match(run.stderr, /reading-core\.mjs/u);
  results.push({
    case: 'rehashed stale compiled module cannot pass source verification',
    exitCode: run.status,
  });
  writeFileSync(modulePath, moduleBytes);
  const originalModules = JSON.parse(JSON.stringify(manifest.modules));
  manifest.modules[0].inputs[0].sha256 = '0'.repeat(64);
  saveManifest();
  run = invoke();
  assert.equal(run.status, 1, run.stderr || String(run.error));
  assert.match(run.stderr, /Compiled module inputs changed/u);
  results.push({ case: 'module input identity cannot be rewritten', exitCode: run.status });
  manifest.modules = originalModules;
  saveManifest();
  const partial = join(out, 'omitted-runtime-fixture');
  mkdirSync(partial);
  // Rehashing a genuinely incomplete app used to pass: source verification
  // considered only entries supplied by the same untrusted manifest.
  const partialInputs = [
    { path: 'index.html', sha256: sha256(index) },
    { path: 'sw.js', sha256: sha256(worker) },
  ];
  const partialDigest = sha256(JSON.stringify(partialInputs));
  writeFileSync(join(partial, 'index.html'), index);
  writeFileSync(join(partial, '404.html'), index);
  writeFileSync(
    join(partial, 'sw.js'),
    Buffer.concat([Buffer.from(`self.KAIRO_ASSET_VERSION = "${partialDigest}";\n`), worker]),
  );
  const partialFiles = ['404.html', 'index.html', 'sw.js'].map((path) => {
    const bytes = readFileSync(join(partial, path));
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  });
  writeJson(join(partial, 'build-identity.json'), {
    ...manifest,
    files: partialFiles,
    sourceAssetSha256: partialDigest,
    artifactSha256: sha256(JSON.stringify(partialFiles)),
  });
  run = spawnSync(process.execPath, [SELF, '--verify-artifact', partial], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(run.status, 1, run.stderr || String(run.error));
  assert.match(run.stderr, /complete runtime asset set/u);
  results.push({
    case: 'coherent manifest cannot omit required runtime assets',
    exitCode: run.status,
    diagnostic: run.stderr,
  });
  writeJson(join(out, 'artifact-controls.json'), results);
  return [
    'executed artifact verification accepts a complete canonical app and rejects dirty, mutated, rehashed, unstamped, incomplete, missing-module and stale-module candidates',
  ];
}

export async function verifyWorkflows(root = ROOT) {
  const { parseDocument } = await import('yaml');
  const workflow = (name) => {
    const document = parseDocument(readFileSync(join(root, '.github/workflows', name), 'utf8'), {
      uniqueKeys: true,
    });
    assert.deepEqual(
      document.errors,
      [],
      `${name} must parse without duplicate keys or invalid YAML`,
    );
    return document.toJS();
  };
  const ci = workflow('ci.yml');
  const pages = workflow('pages-app.yml');
  assert(Object.hasOwn(ci.on, 'workflow_call'));
  assert(Object.hasOwn(ci.on, 'pull_request'));
  assert(!Object.hasOwn(ci.on, 'push'), 'Main builds must use the single Pages build/test chain');
  assert.deepEqual(ci.permissions, { contents: 'read' });
  const apple = ci.jobs['apple-sync'];
  assert(apple, 'Native transport requires an Apple SDK gate');
  assert.equal(apple['runs-on'], 'macos-26');
  assert.equal(
    ci.jobs.checks.needs,
    'apple-sync',
    'Artifact publication must wait for the native gate',
  );
  for (const [name, job] of [
    ['apple-sync', apple],
    ['checks', ci.jobs.checks],
  ]) {
    assert(
      !Object.hasOwn(job, 'if') && !Object.hasOwn(job, 'continue-on-error'),
      `${name} job cannot skip or swallow a required failure`,
    );
  }
  const nativeSteps = [
    {
      id: 'apple-sync',
      run: 'KAIRO_EVIDENCE_DIR="$RUNNER_TEMP/kairo-apple-sync" node packages/apple-sync/tools/verify.mjs',
      evidence: 'kairo-apple-sync',
    },
    {
      id: 'native-rpc',
      run: 'KAIRO_RPC_EVIDENCE_DIR="$RUNNER_TEMP/kairo-native-rpc" node packages/persistence/tools/native-rpc/verify.mjs',
      evidence: 'kairo-native-rpc',
    },
  ];
  let previous = -1;
  for (const expected of nativeSteps) {
    const matches = apple.steps.filter((step) => step.id === expected.id);
    assert.equal(matches.length, 1, `Exactly one required ${expected.id} step must execute`);
    const step = matches[0];
    assert.equal(step.run, expected.run, `${expected.id} must execute its exact native verifier`);
    assert(!Object.hasOwn(step, 'if'), `${expected.id} cannot conditionally skip native tests`);
    assert(
      apple.steps.every((entry) => !Object.hasOwn(entry, 'continue-on-error')),
      'The native gate cannot swallow a compiler/test failure',
    );
    const index = apple.steps.indexOf(step);
    assert(index > previous, 'Native RPC verification must follow the existing Apple SDK gate');
    previous = index;
    const uploads = apple.steps.filter(
      (entry) =>
        entry.uses?.startsWith('actions/upload-artifact@') &&
        entry.with?.name === `${expected.evidence}-evidence`,
    );
    assert.equal(uploads.length, 1, `${expected.id} requires one retained evidence artifact`);
    const upload = uploads[0];
    assert(apple.steps.indexOf(upload) > index, `${expected.id} evidence must follow execution`);
    assert.equal(upload.uses, 'actions/upload-artifact@v4');
    assert.equal(upload.if, 'always()', `${expected.id} failure evidence must be retained`);
    assert.equal(
      upload.with.path,
      '${{ runner.temp }}/' + expected.evidence + '/',
      `${expected.id} evidence must retain its actual verifier output`,
    );
    assert.equal(upload.with['retention-days'], 14);
    assert.equal(upload.with['if-no-files-found'], 'warn');
  }
  // Only an installed runner from this checkout may provide the native result.
  for (const environment of [ci.env, apple.env, ...apple.steps.map((step) => step.env)]) {
    assert(
      !Object.hasOwn(environment || {}, 'KAIRO_RPC_REPO_ROOT'),
      'CI cannot redirect native RPC verification to another repository',
    );
  }
  assert.equal(pages.jobs.verify.uses, './.github/workflows/ci.yml');
  assert.equal(pages.jobs.deploy.needs, 'verify');
  assert.equal(
    pages.jobs.deploy.if,
    "github.ref == 'refs/heads/main' && needs.verify.result == 'success'",
  );
  assert.deepEqual(pages.on.push.branches, ['main']);
  assert(!Object.hasOwn(pages.on, 'pull_request'));
  assert(
    !Object.hasOwn(pages.on.push, 'paths'),
    'Every main change must pass the same promotion gates',
  );
  assert.equal(pages.jobs.deploy.environment.name, 'github-pages');
  assert.equal(pages.jobs.deploy.permissions.pages, 'write');
  assert.equal(pages.jobs.deploy.permissions['id-token'], 'write');
  const steps = ci.jobs.checks.steps;
  const battery = steps.findIndex((step) => step.id === 'battery');
  const artifact = steps.findIndex((step) =>
    step.uses?.startsWith('actions/upload-pages-artifact@'),
  );
  assert(battery >= 0 && artifact > battery);
  assert.equal(
    steps[battery].run,
    'bash docs/build-evidence/renkan/battery.sh "$KAIRO_EVIDENCE_ROOT/battery"',
  );
  assert.equal(steps[artifact].with.path, '${{ env.KAIRO_SITE_DIR }}');
  for (const step of steps.slice(0, artifact + 1))
    assert(!step['continue-on-error'], `${step.name || step.id} cannot turn a failure green`);
  assert.equal(
    steps[artifact].if,
    "success() && github.ref == 'refs/heads/main' && github.event_name != 'pull_request'",
  );
  const deployment = pages.jobs.deploy.steps.find((step) =>
    step.uses?.startsWith('actions/deploy-pages@'),
  );
  assert.equal(deployment.with.artifact_name, steps[artifact].with.name);
  assert(
    pages.jobs.deploy.steps.every((step) => !step.run && !step['continue-on-error']),
    'Deploy consumes the verified artifact without rebuilding or swallowing failure',
  );
  for (const name of ['pages-preview.yml', 'bunki-v11.yml']) {
    const legacy = workflow(name);
    assert.deepEqual(legacy.permissions, { contents: 'read' }, `${name} must be read-only`);
    for (const job of Object.values(legacy.jobs)) {
      assert(!job.environment, `${name} must not create a production deployment record`);
      for (const step of job.steps)
        assert(!step.uses?.includes('pages@') && !step.uses?.includes('pages-artifact@'));
    }
  }
  return [
    'YAML 1.2 parsed without duplicate keys',
    'native Apple SDK and RPC interop gates precede the tested artifact job and retain failure evidence',
    'required battery precedes artifact upload',
    'same artifact name and build/test/deploy dependency',
    'main-only deployment with required permissions',
    'legacy jobs cannot publish or create production environments',
  ];
}

/** Mutated YAML is parsed by the same workflow validator used for release. */
export async function verifyWorkflowFailures(out, root = ROOT) {
  const { parseDocument, stringify } = await import('yaml');
  const fixtures = join(out, 'workflow-fixtures');
  mkdirSync(fixtures);
  const names = ['ci.yml', 'pages-app.yml', 'pages-preview.yml', 'bunki-v11.yml'];
  const originals = Object.fromEntries(
    names.map((name) => [name, readFileSync(join(root, '.github/workflows', name), 'utf8')]),
  );
  const original = parseDocument(originals['ci.yml'], { uniqueKeys: true }).toJS();
  const apple = (ci) => ci.jobs['apple-sync'];
  const rpc = (ci) => apple(ci).steps.find((step) => step.id === 'native-rpc');
  const upload = (ci, id = 'native-rpc') =>
    apple(ci).steps.find((step) => step.with?.name === `kairo-${id}-evidence`);
  const remove = (ci, predicate) => {
    apple(ci).steps = apple(ci).steps.filter((step) => !predicate(step));
  };
  const cases = [
    [
      'missing-rpc-step',
      (ci) => remove(ci, (step) => step.id === 'native-rpc'),
      /Exactly one required native-rpc/,
    ],
    [
      'duplicate-rpc-step',
      (ci) => apple(ci).steps.push(globalThis.structuredClone(rpc(ci))),
      /Exactly one required native-rpc/,
    ],
    [
      'wrong-rpc-command',
      (ci) => {
        rpc(ci).run = 'node packages/persistence/test/replication/native-rpc-session.test.ts';
      },
      /exact native verifier/,
    ],
    [
      'swallowed-rpc-command',
      (ci) => {
        rpc(ci).run += ' || true';
      },
      /exact native verifier/,
    ],
    [
      'conditional-rpc-step',
      (ci) => {
        rpc(ci).if = false;
      },
      /conditionally skip/,
    ],
    [
      'swallowed-rpc-step',
      (ci) => {
        rpc(ci)['continue-on-error'] = true;
      },
      /cannot swallow/,
    ],
    [
      'conditional-native-job',
      (ci) => {
        apple(ci).if = false;
      },
      /apple-sync job cannot skip/,
    ],
    [
      'swallowed-native-job',
      (ci) => {
        apple(ci)['continue-on-error'] = true;
      },
      /apple-sync job cannot skip/,
    ],
    [
      'linux-native-job',
      (ci) => {
        apple(ci)['runs-on'] = 'ubuntu-latest';
      },
      /macos-26/,
    ],
    [
      'missing-native-dependency',
      (ci) => {
        delete ci.jobs.checks.needs;
      },
      /publication must wait/,
    ],
    [
      'unconditional-product-job',
      (ci) => {
        ci.jobs.checks.if = 'always()';
      },
      /checks job cannot skip/,
    ],
    [
      'reversed-native-order',
      (ci) => {
        const entry = rpc(ci);
        remove(ci, (step) => step === entry);
        apple(ci).steps.unshift(entry);
      },
      /must follow the existing/,
    ],
    [
      'missing-rpc-evidence',
      (ci) => remove(ci, (step) => step === upload(ci)),
      /one retained evidence/,
    ],
    [
      'duplicate-rpc-evidence',
      (ci) => apple(ci).steps.push(globalThis.structuredClone(upload(ci))),
      /one retained evidence/,
    ],
    [
      'wrong-rpc-evidence-path',
      (ci) => {
        upload(ci).with.path = '${{ runner.temp }}/other/';
      },
      /actual verifier output/,
    ],
    [
      'success-only-rpc-evidence',
      (ci) => {
        upload(ci).if = 'success()';
      },
      /failure evidence must be retained/,
    ],
    [
      'shorter-rpc-evidence-retention',
      (ci) => {
        upload(ci).with['retention-days'] = 1;
      },
      /14/,
    ],
    [
      'premature-rpc-evidence',
      (ci) => {
        const entry = upload(ci);
        remove(ci, (step) => step === entry);
        apple(ci).steps.unshift(entry);
      },
      /evidence must follow execution/,
    ],
    [
      'redirected-rpc-repository',
      (ci) => {
        apple(ci).env = { KAIRO_RPC_REPO_ROOT: '/other' };
      },
      /another repository/,
    ],
    [
      'missing-existing-native-step',
      (ci) => remove(ci, (step) => step.id === 'apple-sync'),
      /Exactly one required apple-sync/,
    ],
    [
      'conditional-existing-native-step',
      (ci) => {
        apple(ci).steps.find((step) => step.id === 'apple-sync').if = false;
      },
      /conditionally skip/,
    ],
    [
      'missing-existing-native-evidence',
      (ci) => remove(ci, (step) => step === upload(ci, 'apple-sync')),
      /one retained evidence/,
    ],
  ];
  const results = [];
  const check = async (name, contents, expected) => {
    const fixture = join(fixtures, name);
    const directory = join(fixture, '.github/workflows');
    mkdirSync(directory, { recursive: true });
    for (const file of names)
      writeFileSync(join(directory, file), file === 'ci.yml' ? contents : originals[file]);
    if (!expected) {
      const checks = await verifyWorkflows(fixture);
      results.push({ name, status: 'accepted', checks });
      return;
    }
    let rejection;
    try {
      await verifyWorkflows(fixture);
    } catch (error) {
      rejection = error;
    }
    assert(rejection, `${name} must reject`);
    assert.match(rejection.message, expected, `${name} must reject for the intended contract`);
    results.push({ name, status: 'rejected', diagnostic: rejection.message });
  };
  await check('complete-native-ci-chain', originals['ci.yml']);
  for (const [name, mutate, expected] of cases) {
    const ci = globalThis.structuredClone(original);
    mutate(ci);
    await check(name, stringify(ci), expected);
  }
  await check('duplicate-yaml-key', originals['ci.yml'] + '\njobs: {}\n', /without duplicate keys/);
  writeJson(join(out, 'workflow-controls.json'), {
    schemaVersion: 1,
    scope: 'parsed CI contracts; no GitHub jobs or synthetic native success receipts are executed',
    results,
  });
  return [
    'native workflow admission accepts the full chain and rejects missing, skipped, swallowed, redirected or unretained native execution',
  ];
}

function verifyTeachingReports(out) {
  const directory = join(out, 'teaching-report-controls');
  mkdirSync(directory);
  const artifactSha256 = 'a'.repeat(64),
    sourceSha256 = 'b'.repeat(64);
  const controls = [];
  for (const type of ['teaching-context', 'ai-adaptation']) {
    const browser = type === 'ai-adaptation';
    const fixture = {
      suite: browser ? 'actual-request-teaching-context' : 'actual-teaching-context-exports',
      pass: true,
      artifactSha256,
      verifierSha256: sourceSha256,
      results: (browser ? AI_ADAPTATION_CASES : TEACHING_CONTEXT_CASES).map((name) => ({
        name,
        pass: true,
      })),
      ...(browser
        ? {
            selectedCase: 'all',
            timedOut: false,
            externalRequests: [],
            routeErrors: [],
            browserErrors: [],
            expectedAbortErrors: [],
            handles: {
              browserContextsCreated: 1,
              browserContextsClosed: 1,
              browserClosed: true,
              serverClosed: true,
            },
            checks: [
              { name: 'all six teaching request surfaces were actually observed', pass: true },
            ],
          }
        : { browsers: 0, providerRequests: 0 }),
    };
    const path = join(directory, `${type}.json`);
    const report = { path, type, artifactSha256, sourceSha256 };
    writeJson(path, fixture);
    requireCompleteReport(report);
    const cases = [
      ['missing-case', { results: fixture.results.slice(1) }],
      ['duplicate-case', { results: [...fixture.results.slice(1), fixture.results[1]] }],
      [
        'failed-case',
        { results: fixture.results.map((row, index) => (index ? row : { ...row, pass: false })) },
      ],
      ['wrong-artifact', { artifactSha256: 'c'.repeat(64) }],
      ['wrong-verifier', { verifierSha256: 'c'.repeat(64) }],
      ['failed', { pass: false }],
      ...(browser
        ? [
            ['subset', { selectedCase: 'privacy' }],
            ['timed-out', { timedOut: true }],
            ['external-request', { externalRequests: ['unexpected'] }],
            ['route-error', { routeErrors: ['unexpected'] }],
            ['browser-error', { browserErrors: ['unexpected'] }],
            ['open-context', { handles: { ...fixture.handles, browserContextsClosed: 0 } }],
            ['open-server', { handles: { ...fixture.handles, serverClosed: false } }],
            ['missing-surface-coverage', { checks: [] }],
          ]
        : [
            ['provider-request', { providerRequests: 1 }],
            ['unexpected-browser', { browsers: 1 }],
          ]),
    ];
    for (const [name, changed] of cases) {
      writeJson(path, { ...fixture, ...changed });
      assert.throws(() => requireCompleteReport(report), undefined, `${type}: ${name}`);
      controls.push({ type, name, rejected: true });
    }
    writeJson(path, fixture);
    assert.throws(() => requireCompleteReport({ ...report, artifactSha256: null }));
    assert.throws(() => requireCompleteReport({ ...report, sourceSha256: null }));
  }
  writeJson(join(directory, 'controls.json'), controls);
  return [
    'teaching receipts require pinned artifacts and verifiers, complete named coverage and closed browser resources',
  ];
}

function verifySearchReports(out) {
  const directory = join(out, 'search-report-controls');
  mkdirSync(directory);
  const artifactSha256 = 'a'.repeat(64),
    sourceSha256 = 'b'.repeat(64),
    controls = [];
  for (const type of ['search-fallback-core', 'search-fallback-ui']) {
    const browser = type === 'search-fallback-ui';
    const fixture = {
      suite: browser ? 'actual-ui-search-fallback' : 'actual-source-search-fallback',
      pass: true,
      artifactSha256,
      verifierSha256: sourceSha256,
      checks: (browser ? SEARCH_UI_CHECKS : SEARCH_FALLBACK_CASES).map((name) => ({
        name,
        pass: true,
      })),
      ...(browser
        ? {
            results: SEARCH_UI_CASES.map((name) => ({ name, pass: true })),
            selectedCase: 'all',
            timedOut: false,
            externalRequests: [],
            routeErrors: [],
            errors: [],
            expectedFaultErrors: [],
            origin: 'http://127.0.0.1:43187',
            handles: {
              contextsCreated: 1,
              contextsClosed: 1,
              browserClosed: true,
              serverClosed: true,
            },
          }
        : { baseline: null }),
    };
    const path = join(directory, `${type}.json`),
      report = { path, type, artifactSha256, sourceSha256 };
    writeJson(path, fixture);
    requireCompleteReport(report);
    const cases = [
      ['missing-check', { checks: fixture.checks.slice(1) }],
      ['duplicate-check', { checks: [...fixture.checks.slice(1), fixture.checks[1]] }],
      [
        'failed-check',
        { checks: fixture.checks.map((row, i) => (i ? row : { ...row, pass: false })) },
      ],
      ['wrong-artifact', { artifactSha256: 'c'.repeat(64) }],
      ['wrong-verifier', { verifierSha256: 'c'.repeat(64) }],
      ['failed', { pass: false }],
      ...(browser
        ? [
            ['subset', { selectedCase: 'pending' }],
            ['missing-case', { results: fixture.results.slice(1) }],
            ['duplicate-case', { results: [...fixture.results.slice(1), fixture.results[1]] }],
            [
              'failed-case',
              { results: fixture.results.map((row, i) => (i ? row : { ...row, pass: false })) },
            ],
            ['timed-out', { timedOut: true }],
            ['external-request', { externalRequests: ['unexpected'] }],
            ['route-error', { routeErrors: ['unexpected'] }],
            ['browser-error', { errors: ['unexpected'] }],
            [
              'self-declared-page-error',
              { errors: [{ type: 'pageerror' }], expectedFaultErrors: [{ type: 'pageerror' }] },
            ],
            ...['contextsCreated', 'contextsClosed', 'browserClosed', 'serverClosed'].map((key) => [
              key,
              { handles: { ...fixture.handles, [key]: key === 'contextsCreated' ? 2 : 0 } },
            ]),
          ]
        : [['historical-substitution', { baseline: { artifactSha256: 'c'.repeat(64) } }]]),
    ];
    for (const [name, changed] of cases) {
      writeJson(path, { ...fixture, ...changed });
      assert.throws(() => requireCompleteReport(report), undefined, `${type}: ${name}`);
      controls.push({ type, name, rejected: true });
    }
    writeJson(path, fixture);
    assert.throws(() => requireCompleteReport({ ...report, artifactSha256: null }));
    assert.throws(() => requireCompleteReport({ ...report, sourceSha256: null }));
    if (browser) {
      const error = {
        type: 'console',
        case: 'missing',
        location: { url: fixture.origin + '/data/share_alike/dict-v2/index.json' },
        error: 'Failed to load resource: 503',
      };
      writeJson(path, { ...fixture, errors: [error], expectedFaultErrors: [error] });
      requireCompleteReport(report);
      const wrong = { ...error, location: { url: fixture.origin + '/corridor.js' } };
      writeJson(path, { ...fixture, errors: [wrong], expectedFaultErrors: [wrong] });
      assert.throws(() => requireCompleteReport(report));
      controls.push({ type, name: 'wrong-fault-endpoint', rejected: true });
    }
  }
  writeJson(join(directory, 'controls.json'), controls);
  return [
    'search receipts require current artifact/verifier pins, complete named coverage, scoped faults and closed resources',
  ];
}

function verifyStandaloneJourneyReports(out) {
  const directory = join(out, 'standalone-journey-report-controls');
  mkdirSync(directory);
  const path = join(directory, 'results.json'),
    output = join(directory, 'corridor-standalone.html');
  const artifactSha256 = 'a'.repeat(64),
    sourceSha256 = 'b'.repeat(64),
    builderSha256 = 'c'.repeat(64);
  const sourceAssetSha256 = 'd'.repeat(64);
  const siteDir = join(directory, 'pinned-site');
  const recordBytes = Buffer.from('export const record = "receiver fixture only";');
  const inkBytes = Buffer.from('export const ink = "receiver fixture only";');
  const bytes = Buffer.from(`<!doctype html><title>Receipt validation fixture only</title>
<script type="application/octet-stream" id="standalone-record-module">${recordBytes.toString('base64')}</script>
<script type="module">
window.__KAIRO_INK_URL__ = standaloneModuleUrl("${inkBytes.toString('base64')}");
</script>`);
  writeFileSync(output, bytes);
  const fixture = {
    schemaVersion: 1,
    pass: true,
    status: 'passed',
    site: siteDir,
    expectedArtifactSha256: artifactSha256,
    artifactSha256,
    sourceAssetSha256,
    verifier: { sha256: sourceSha256 },
    finalVerifierSha256: sourceSha256,
    builder: { sha256: builderSha256 },
    finalBuilderSha256: builderSha256,
    expectedStations: STANDALONE_JOURNEY_STATIONS,
    passed: STANDALONE_JOURNEY_STATIONS,
    failures: [],
    skipped: [],
    startupErrors: [],
    cleanupErrors: [],
    stationErrors: [],
    identityErrors: [],
    pageErrors: [],
    blockedRequests: [],
    timedOut: false,
    audioOutput: { mode: 'test-silenced' },
    browser: { engine: 'chromium', version: 'fixture-only', executablePath: process.execPath },
    handles: {
      processId: 1,
      browserCreated: true,
      contextsCreated: 1,
      contextCloseAttempted: true,
      contextClosed: true,
      browserCloseAttempted: true,
      browserClosed: true,
      finalBrowserConnected: false,
      finalContextCount: 0,
      finalPageClosed: true,
    },
    recoveredRecordSha256: 'e'.repeat(64),
    standalone: {
      status: 'passed',
      site: siteDir,
      artifactSha256,
      output,
      builderSha256,
      standaloneSha256: createHash('sha256').update(bytes).digest('hex'),
      selfContainedController: true,
      recordModuleTransport: 'blob',
      inlinedModuleTransport: 'blob',
      driftSharesRecordRuntime: true,
      inlinedRecordModules: STANDALONE_RECORD_MODULES,
      recordRuntimeSha256: createHash('sha256').update(recordBytes).digest('hex'),
      inkModuleSha256: createHash('sha256').update(inkBytes).digest('hex'),
    },
  };
  const report = {
    path,
    type: 'standalone-journey',
    artifactSha256,
    sourceAssetSha256,
    sourceSha256,
    builderSha256,
    siteDir,
  };
  const save = (value) => {
    writeJson(path, value);
    writeJson(`${output}.build.json`, value.standalone);
  };
  save(fixture);
  requireCompleteReport(report);
  const controls = [];
  const mutations = [
    [
      'missing-station',
      (v) => {
        v.passed.pop();
      },
    ],
    [
      'duplicate-station',
      (v) => {
        v.passed[0] = v.passed[1];
      },
    ],
    [
      'reordered-stations',
      (v) => {
        v.passed.reverse();
      },
    ],
    [
      'self-declared-subset',
      (v) => {
        v.passed.pop();
        v.expectedStations.pop();
      },
    ],
    [
      'wrong-schema',
      (v) => {
        v.schemaVersion = 2;
      },
    ],
    [
      'false-pass',
      (v) => {
        v.pass = false;
      },
    ],
    [
      'failed-status',
      (v) => {
        v.status = 'failed';
      },
    ],
    [
      'wrong-artifact',
      (v) => {
        v.artifactSha256 = 'f'.repeat(64);
      },
    ],
    [
      'wrong-expected-artifact',
      (v) => {
        v.expectedArtifactSha256 = 'f'.repeat(64);
      },
    ],
    [
      'missing-source-asset',
      (v) => {
        delete v.sourceAssetSha256;
      },
    ],
    [
      'wrong-source-asset',
      (v) => {
        v.sourceAssetSha256 = 'f'.repeat(64);
      },
    ],
    [
      'wrong-verifier',
      (v) => {
        v.verifier.sha256 = 'f'.repeat(64);
      },
    ],
    [
      'changed-final-verifier',
      (v) => {
        v.finalVerifierSha256 = 'f'.repeat(64);
      },
    ],
    [
      'wrong-builder',
      (v) => {
        v.builder.sha256 = 'f'.repeat(64);
      },
    ],
    [
      'changed-final-builder',
      (v) => {
        v.finalBuilderSha256 = 'f'.repeat(64);
      },
    ],
    [
      'wrong-site',
      (v) => {
        v.site += '-other';
      },
    ],
    [
      'timed-out',
      (v) => {
        v.timedOut = true;
      },
    ],
    [
      'audible',
      (v) => {
        v.audioOutput.mode = 'unmuted';
      },
    ],
    [
      'wrong-engine',
      (v) => {
        v.browser.engine = 'webkit';
      },
    ],
    [
      'missing-browser-version',
      (v) => {
        v.browser.version = '';
      },
    ],
    [
      'missing-browser-executable',
      (v) => {
        v.browser.executablePath = '';
      },
    ],
    [
      'missing-recovered-record',
      (v) => {
        delete v.recoveredRecordSha256;
      },
    ],
    [
      'invalid-process',
      (v) => {
        v.handles.processId = 0;
      },
    ],
    [
      'extra-context',
      (v) => {
        v.handles.contextsCreated = 2;
      },
    ],
    [
      'connected-browser',
      (v) => {
        v.handles.finalBrowserConnected = true;
      },
    ],
    [
      'remaining-context',
      (v) => {
        v.handles.finalContextCount = 1;
      },
    ],
    ...[
      'browserCreated',
      'contextCloseAttempted',
      'contextClosed',
      'browserCloseAttempted',
      'browserClosed',
      'finalPageClosed',
    ].map((key) => [
      key,
      (v) => {
        v.handles[key] = false;
      },
    ]),
    ...[
      'failures',
      'skipped',
      'startupErrors',
      'cleanupErrors',
      'stationErrors',
      'identityErrors',
      'pageErrors',
      'blockedRequests',
    ].map((key) => [
      key,
      (v) => {
        v[key] = ['unexpected'];
      },
    ]),
    [
      'failed-build',
      (v) => {
        v.standalone.status = 'failed';
      },
    ],
    [
      'wrong-build-artifact',
      (v) => {
        v.standalone.artifactSha256 = 'f'.repeat(64);
      },
    ],
    [
      'wrong-build-source',
      (v) => {
        v.standalone.builderSha256 = 'f'.repeat(64);
      },
    ],
    [
      'wrong-build-site',
      (v) => {
        v.standalone.site += '-other';
      },
    ],
    [
      'foreign-output',
      (v) => {
        v.standalone.output += '-other';
      },
    ],
    [
      'missing-record-module',
      (v) => {
        v.standalone.inlinedRecordModules.pop();
      },
    ],
    [
      'duplicate-record-module',
      (v) => {
        v.standalone.inlinedRecordModules[0] = v.standalone.inlinedRecordModules[1];
      },
    ],
    [
      'missing-record-runtime',
      (v) => {
        delete v.standalone.recordRuntimeSha256;
      },
    ],
    [
      'wrong-record-runtime',
      (v) => {
        v.standalone.recordRuntimeSha256 = '0'.repeat(64);
      },
    ],
    [
      'missing-ink',
      (v) => {
        delete v.standalone.inkModuleSha256;
      },
    ],
    [
      'wrong-ink',
      (v) => {
        v.standalone.inkModuleSha256 = '0'.repeat(64);
      },
    ],
    [
      'separate-record-runtime',
      (v) => {
        v.standalone.driftSharesRecordRuntime = false;
      },
    ],
    [
      'external-controller',
      (v) => {
        v.standalone.selfContainedController = false;
      },
    ],
    [
      'wrong-record-transport',
      (v) => {
        v.standalone.recordModuleTransport = 'data';
      },
    ],
    [
      'wrong-module-transport',
      (v) => {
        v.standalone.inlinedModuleTransport = 'data';
      },
    ],
    [
      'wrong-standalone-digest',
      (v) => {
        v.standalone.standaloneSha256 = 'f'.repeat(64);
      },
    ],
  ];
  for (const [name, mutate] of mutations) {
    const value = JSON.parse(JSON.stringify(fixture));
    mutate(value);
    save(value);
    assert.throws(() => requireCompleteReport(report), undefined, name);
    controls.push({ name, rejected: true });
  }
  save(fixture);
  for (const key of [
    'artifactSha256',
    'sourceAssetSha256',
    'sourceSha256',
    'builderSha256',
    'siteDir',
  ]) {
    assert.throws(() => requireCompleteReport({ ...report, [key]: null }), undefined, key);
    controls.push({ name: `missing-independent-${key}`, rejected: true });
  }
  writeJson(`${output}.build.json`, { ...fixture.standalone, unexpected: true });
  assert.throws(() => requireCompleteReport(report));
  controls.push({ name: 'build-receipt-disagreement', rejected: true });
  save(fixture);
  writeFileSync(output, Buffer.concat([bytes, Buffer.from('changed')]));
  assert.throws(() => requireCompleteReport(report));
  controls.push({ name: 'changed-output-bytes', rejected: true });
  // Refresh the outer digest and both receipts so these controls reach the
  // embedded-payload defenses, rather than failing only the whole-file hash.
  for (const [name, changed] of [
    [
      'missing-record-payload',
      bytes.toString().replace('id="standalone-record-module"', 'id="other"'),
    ],
    [
      'duplicate-record-payload',
      bytes.toString() +
        `\n<script type="application/octet-stream" id="standalone-record-module">${recordBytes.toString('base64')}</script>`,
    ],
    [
      'wrong-record-payload',
      bytes
        .toString()
        .replace(
          recordBytes.toString('base64'),
          Buffer.from('different record').toString('base64'),
        ),
    ],
    ['missing-ink-payload', bytes.toString().replace('__KAIRO_INK_URL__', '__OTHER_URL__')],
    [
      'duplicate-ink-payload',
      bytes.toString() +
        `\nwindow.__KAIRO_INK_URL__ = standaloneModuleUrl("${inkBytes.toString('base64')}");`,
    ],
    [
      'wrong-ink-payload',
      bytes
        .toString()
        .replace(inkBytes.toString('base64'), Buffer.from('different ink').toString('base64')),
    ],
  ]) {
    const value = JSON.parse(JSON.stringify(fixture));
    value.standalone.standaloneSha256 = createHash('sha256').update(changed).digest('hex');
    save(value);
    writeFileSync(output, changed);
    assert.throws(() => requireCompleteReport(report), undefined, name);
    controls.push({ name, rejected: true });
  }
  save(fixture);
  writeFileSync(output, bytes);
  for (const file of [path, output, `${output}.build.json`]) {
    const target = `${file}.saved`;
    renameSync(file, target);
    assert.throws(() => requireCompleteReport(report));
    symlinkSync(target, file);
    assert.throws(() => requireCompleteReport(report));
    unlinkSync(file);
    renameSync(target, file);
    controls.push({ name: `missing-or-symlink-${relative(directory, file)}`, rejected: true });
  }
  requireCompleteReport(report);
  const gate = batteryGates(out, { KAIRO_VERIFIED_ARTIFACT_SHA256: artifactSha256 }).find(
    (entry) => entry.name === 'standalone-journey',
  );
  assert.deepEqual(gate.args, [
    'prototypes/corridor/tools/verify-journey.mjs',
    '--evidence-out',
    join(out, 'standalone-journey'),
  ]);
  assert.equal(gate.report.artifactSha256, artifactSha256);
  assert.equal(
    gate.report.siteDir,
    null,
    'No artifact directory may be inferred when it was not supplied',
  );
  assert.equal(
    gate.report.sourceAssetSha256,
    null,
    'No source asset identity may be inferred without a site',
  );
  for (const [key, file] of [
    ['sourceSha256', 'verify-journey'],
    ['builderSha256', 'build-standalone'],
  ])
    assert.equal(
      gate.report[key],
      createHash('sha256')
        .update(readFileSync(join(ROOT, `prototypes/corridor/tools/${file}.mjs`)))
        .digest('hex'),
    );
  writeJson(join(directory, 'controls.json'), {
    scope: 'Receipt receiver controls only; no browser journey executed',
    controls,
  });
  return [
    'standalone journey requires all twelve stations, pinned build/verifier identities, exact local output and closed silent browser handles',
  ];
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--verify-artifact') {
    assert(
      args.length === 2 || (args.length === 3 && args[2] === '--require-clean'),
      'Usage: --verify-artifact <site> [--require-clean]',
    );
    console.log(JSON.stringify(verifyArtifact(args[1], args[2] === '--require-clean'), null, 2));
  } else if (args[0] === '--run-battery') {
    assert.equal(args.length, 2, 'Usage: --run-battery <fresh-output-directory>');
    const out = freshOutput(args[1]);
    mkdirSync(out, { recursive: true });
    const site = process.env.KAIRO_SITE_DIR || join(out, 'site');
    if (!process.env.KAIRO_SITE_DIR) {
      const assembly = spawnSync(
        process.execPath,
        ['scripts/build-corridor-site.mjs', '--out', site],
        {
          cwd: ROOT,
          encoding: 'utf8',
          timeout: 180_000,
        },
      );
      writeFileSync(join(out, 'assembly.log'), `${assembly.stdout || ''}${assembly.stderr || ''}`);
      assert.equal(
        assembly.status,
        0,
        `Battery assembly failed: ${assembly.error || 'see assembly.log'}`,
      );
    }
    const verified = verifyArtifact(site);
    writeJson(join(out, 'artifact-verification.json'), verified);
    const gateEnvironment = {
      ...process.env,
      KAIRO_SITE_DIR: site,
      KAIRO_VERIFIED_ARTIFACT_SHA256: verified.artifactSha256,
    };
    const source = {
      sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
      dirty:
        execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() !==
        '',
      site,
      artifactSha256: verified.artifactSha256,
    };
    const controller = new globalThis.AbortController();
    const interrupt = () => controller.abort();
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    try {
      process.exitCode = (
        await runGates({
          gates: batteryGates(out, gateEnvironment),
          root: ROOT,
          out,
          source,
          signal: controller.signal,
        })
      ).exitCode;
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    }
  } else {
    assert(
      args.length === 0 || (args.length === 2 && args[0] === '--out'),
      'Usage: verify-release-gates.mjs [--out <fresh-output-directory>]',
    );
    const base = join(homedir(), '.dharma/bunki/release-gates');
    if (!args.length) mkdirSync(base, { recursive: true });
    const out = freshOutput(args[1] || mkdtempSync(join(base, 'verify-')));
    const checks = [
      ...(await verifyRunner(out)),
      ...verifyTeachingReports(out),
      ...verifySearchReports(out),
      ...verifyStandaloneJourneyReports(out),
      ...verifyArtifactFailures(out),
      ...(await verifyWorkflows()),
      ...(await verifyWorkflowFailures(out)),
    ];
    writeJson(join(out, 'verification-report.json'), {
      schemaVersion: 1,
      completedAt: now(),
      checks,
      passed: checks.length,
      scope:
        'executed runner failure paths and parsed workflow contracts; GitHub-hosted deployment is not executed',
    });
    console.log(`${checks.length} release-gate checks passed; evidence: ${out}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
