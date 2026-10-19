import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileEvidence, requireFrameworkReceipt } from './framework-receipt.mjs';
import {
  FRAMEWORK_GATES,
  discoverUniverse,
  frameworkGateRoster,
  requireFrameworkFiles,
  requireUniverse,
} from './framework-rosters.mjs';
import PlaywrightReceiptReporter from './playwright-receipt-reporter.mjs';
import VitestReceiptReporter from './vitest-receipt-reporter.mjs';
const root = fileURLToPath(new globalThis.URL('../..', import.meta.url)),
  require = createRequire(import.meta.url);
const parent =
  process.env.KAIRO_EVIDENCE_DIR ||
  join(homedir(), '.dharma/bunki/verifier-receipts/framework-tests');
mkdirSync(parent, { recursive: true });
const evidence = mkdtempSync(join(parent, 'framework-fixtures-')),
  observations = [];
const pwVersion = JSON.parse(
  readFileSync(resolve(root, 'node_modules/@playwright/test/package.json')),
).version;
const viVersion = JSON.parse(
  readFileSync(resolve(root, 'node_modules/vitest/package.json')),
).version;
const reporter = resolve(root, 'scripts/ci/playwright-receipt-reporter.mjs');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sources = [
  'framework-receipt.mjs',
  'framework-receipt.test.mjs',
  'vitest-receipt-reporter.mjs',
  'playwright-receipt-reporter.mjs',
  'vh_pytest_receipt.py',
  'verification-admission.mjs',
  'framework-rosters.mjs',
  'framework-rosters.json',
];
const currentSources = () =>
  Object.fromEntries(
    sources.map((file) => [file, sha(readFileSync(resolve(root, 'scripts/ci', file)))]),
  );
const sourceHashes = currentSources();
writeFileSync(
  join(evidence, 'source-identity.json'),
  JSON.stringify(
    { node: process.version, playwright: pwVersion, vitest: viVersion, sourceHashes },
    null,
    2,
  ) + '\n',
);
function record(row) {
  assert.deepEqual(currentSources(), sourceHashes, 'Framework source changed during fixtures');
  row.receiptSha256 = sha(readFileSync(row.path));
  observations.push(row);
  writeFileSync(join(evidence, 'observations.json'), JSON.stringify(observations, null, 2) + '\n');
}
function childEnv(out, runId) {
  const env = {
    ...process.env,
    KAIRO_FRAMEWORK_RECEIPT: out,
    KAIRO_GATE_RUN_ID: runId,
    PYTHONDONTWRITEBYTECODE: '1',
  };
  for (const key of [
    'NODE_TEST_CONTEXT',
    'NODE_OPTIONS',
    'PYTEST_ADDOPTS',
    'PYTEST_PLUGINS',
    'PLAYWRIGHT_GREP',
  ])
    delete env[key];
  return env;
}
function result(command, args, dir, framework, mode) {
  const path = join(dir, 'framework.json'),
    runId = randomUUID(),
    env = childEnv(path, runId);
  if (framework === 'pytest') {
    env.PYTHONPATH = resolve(root, 'scripts/ci');
    env.PYTEST_DISABLE_PLUGIN_AUTOLOAD = '1';
  }
  const run = spawnSync(command, args, {
    cwd: dir,
    env,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
  });
  writeFileSync(join(dir, 'stdout.txt'), run.stdout || '');
  writeFileSync(join(dir, 'stderr.txt'), run.stderr || '');
  assert(!run.error, `${framework}/${mode}: ${run.error?.message}`);
  assert.equal(run.signal, null);
  let raw;
  try {
    raw = readFileSync(path);
  } catch (error) {
    // a framework that never started (an interpreter without pytest; VH_TEST_PYTHON names the one
    // to use) writes no receipt: say so in its own words, not as a missing file
    assert.fail(
      `${framework}/${mode}: no receipt (${error.code}); ${command} exited ${run.status}: ${(run.stderr || '').trim().split('\n').at(-1)}`,
    );
  }
  const receipt = JSON.parse(raw);
  assert.equal(receipt.runId, runId);
  assert.equal(receipt.framework, framework);
  record({
    framework,
    mode,
    status: run.status,
    fullAcceptance: receipt.fullAcceptance,
    filtered: receipt.filtered,
    collected: receipt.collected.length,
    completed: receipt.completed.length,
    version: receipt.version,
    errors: receipt.errors,
    path,
  });
  return { receipt, status: run.status };
}
function playwright(mode) {
  const dir = join(evidence, `playwright-${mode}`);
  mkdirSync(dir);
  const spec = join(dir, 'case.spec.cjs');
  const prefix = `const {test,expect}=require(${JSON.stringify(require.resolve('@playwright/test'))});\n`;
  const bodies = {
    pass: "test('keep',()=>expect(2+2).toBe(4));test('other',()=>expect('a').toBe('a'));",
    skip: "test('keep',()=>{});test.skip('other',()=>{});",
    failure: "test('failure',()=>expect(1).toBe(2));",
    empty: '// no test cases',
    filtered: "test('keep',()=>{});test('other',()=>{});",
    filefilter: "test('keep',()=>{});",
    only: "test.only('keep',()=>{});test('other',()=>{});",
    retry: "test('retry',({},info)=>expect(info.retry).toBe(1));",
  };
  writeFileSync(spec, prefix + bodies[mode]);
  if (mode === 'filefilter')
    writeFileSync(join(dir, 'other.spec.cjs'), prefix + "test('other',()=>{});");
  const config = join(dir, 'playwright.config.cjs');
  writeFileSync(
    config,
    'module.exports=' +
      JSON.stringify({
        testDir: dir,
        testMatch: '*.spec.cjs',
        workers: 1,
        retries: mode === 'retry' ? 1 : 0,
        forbidOnly: false,
        outputDir: join(dir, 'results'),
        reporter: [[reporter]],
      }) +
      ';\n',
  );
  return result(
    process.execPath,
    [
      require.resolve('@playwright/test/cli'),
      'test',
      '--config',
      config,
      ...(mode === 'filtered'
        ? ['--grep', 'keep']
        : mode === 'filefilter'
          ? ['case.spec.cjs']
          : []),
    ],
    dir,
    'playwright',
    mode,
  );
}
test('real Playwright Test reporter records no-browser pass and rejects skip/failure/empty/retry/filtered/focused runs', () => {
  const good = playwright('pass');
  assert.equal(good.status, 0);
  assert.equal(good.receipt.version, pwVersion);
  assert.equal(good.receipt.collected.length, 2);
  requireFrameworkReceipt(good.receipt, 'playwright');
  const admitted = [];
  for (const mode of ['skip', 'failure', 'empty', 'retry', 'filtered', 'filefilter', 'only']) {
    const { receipt, status } = playwright(mode);
    if (['filtered', 'filefilter'].includes(mode)) {
      assert.equal(status, 0);
      assert.equal(receipt.collected.length, 1, 'filter control selects exactly one real test');
    }
    if (receipt.fullAcceptance) admitted.push(mode);
    else assert.throws(() => requireFrameworkReceipt(receipt, 'playwright'));
  }
  assert.deepEqual(
    admitted,
    [],
    'No narrowed, skipped, failed or retried run can be full acceptance',
  );
});
function receiptRun(Reporter, framework, mode) {
  const dir = join(evidence, `${framework}-hooks-${mode}`);
  mkdirSync(dir);
  const path = join(dir, 'framework.json'),
    file = join(dir, 'case.fixture.js');
  writeFileSync(file, '// framework event fixture\n');
  const prior = { out: process.env.KAIRO_FRAMEWORK_RECEIPT, id: process.env.KAIRO_GATE_RUN_ID };
  process.env.KAIRO_FRAMEWORK_RECEIPT = path;
  process.env.KAIRO_GATE_RUN_ID = randomUUID();
  try {
    const r = new Reporter();
    if (framework === 'playwright') {
      const t = {
        id: 'one',
        titlePath: () => ['suite', 'one'],
        location: { file },
        expectedStatus: mode === 'expected-failure' ? 'failed' : 'passed',
      };
      r.onBegin(
        {
          version: pwVersion,
          grep: mode === 'filtered' ? /one/ : /.*/,
          grepInvert: null,
          maxFailures: 0,
          shard: null,
        },
        { allTests: () => [t] },
      );
      if (mode !== 'missing')
        r.onTestEnd(t, {
          status: mode === 'failure' ? 'failed' : 'passed',
          retry: mode === 'retry' ? 1 : 0,
        });
      if (mode === 'duplicate') r.onTestEnd(t, { status: 'passed', retry: 0 });
      r.onEnd({ status: 'passed' });
    } else {
      const t = {
        id: 'one',
        fullName: 'suite one',
        options: { fails: mode === 'expected-failure' },
        result: () => ({ state: mode === 'failure' ? 'failed' : 'passed' }),
        diagnostic: () => ({ retryCount: mode === 'retry' ? 1 : 0 }),
      };
      r.onInit({
        version: viVersion,
        config: mode === 'filtered' ? { testNamePattern: 'one' } : {},
      });
      r.onTestRunStart([{ moduleId: file }]);
      r.onTestModuleCollected({ moduleId: file, children: { allTests: () => [t] } });
      if (mode !== 'missing') r.onTestCaseResult(t);
      if (mode === 'duplicate') r.onTestCaseResult(t);
      r.onTestRunEnd([{ ok: () => true }], [], 'passed');
    }
    const receipt = JSON.parse(readFileSync(path));
    record({
      framework,
      mode: `hooks-${mode}`,
      fullAcceptance: receipt.fullAcceptance,
      collected: receipt.collected.length,
      completed: receipt.completed.length,
      errors: receipt.errors,
      path,
    });
    return receipt;
  } finally {
    for (const [key, value] of [
      ['KAIRO_FRAMEWORK_RECEIPT', prior.out],
      ['KAIRO_GATE_RUN_ID', prior.id],
    ])
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
}
for (const [name, Reporter] of [
  ['playwright', PlaywrightReceiptReporter],
  ['vitest', VitestReceiptReporter],
])
  test(`${name} actual reporter refuses missing/duplicate/retry/failed/filtered/expected-failure completion events`, () => {
    requireFrameworkReceipt(receiptRun(Reporter, name, 'pass'), name);
    for (const mode of [
      'missing',
      'duplicate',
      'retry',
      'failure',
      'filtered',
      'expected-failure',
    ]) {
      const receipt = receiptRun(Reporter, name, mode);
      assert.equal(receipt.fullAcceptance, false, mode);
      assert.throws(() => requireFrameworkReceipt(receipt, name));
    }
  });
const python = process.env.VH_TEST_PYTHON || 'python3';
function pytest(mode) {
  const dir = join(evidence, `pytest-${mode}`);
  mkdirSync(dir);
  const file = join(dir, 'test_fixture.py');
  const bodies = {
    pass: 'def test_one(): assert 2 + 2 == 4\ndef test_two(): assert True\n',
    skip: 'import pytest\ndef test_one(): assert True\n@pytest.mark.skip(reason="control")\ndef test_two(): pass\n',
    failure: 'def test_one(): assert False\n',
    empty: '# no collected tests\n',
    keyword: 'def test_one(): pass\ndef test_two(): pass\n',
    deselect: 'def test_one(): pass\ndef test_two(): pass\n',
    nodeid: 'def test_one(): pass\ndef test_two(): pass\n',
    'declared-marker':
      'import pytest\ndef test_one(): pass\n@pytest.mark.realdata\ndef test_two(): pass\n',
  };
  writeFileSync(file, bodies[mode]);
  const args = [
    '-m',
    'pytest',
    '-q',
    '-p',
    'no:cacheprovider',
    '-p',
    'vh_pytest_receipt',
    '--rootdir',
    dir,
    mode === 'nodeid' ? file + '::test_one' : file,
  ];
  if (mode === 'declared-marker') args.push('-m', 'not realdata');
  if (mode === 'keyword') args.push('-k', 'test_one');
  if (mode === 'deselect') args.push('--deselect', 'test_fixture.py::test_two');
  return result(python, args, dir, 'pytest', mode);
}
test('actual pytest plugin rejects incomplete, skipped, failed, empty and narrowed collections', () => {
  const good = pytest('pass');
  assert.equal(good.status, 0);
  assert.equal(good.receipt.collected.length, 2);
  requireFrameworkReceipt(good.receipt, 'pytest');
  const declared = pytest('declared-marker');
  assert.equal(declared.status, 0);
  assert.equal(declared.receipt.collected.length, 1);
  assert.equal(declared.receipt.filtered, false);
  requireFrameworkReceipt(declared.receipt, 'pytest');
  const admitted = [];
  for (const mode of ['skip', 'failure', 'empty', 'keyword', 'deselect', 'nodeid']) {
    const { receipt } = pytest(mode);
    if (receipt.fullAcceptance) admitted.push(mode);
    else assert.throws(() => requireFrameworkReceipt(receipt, 'pytest'));
  }
  assert.deepEqual(admitted, [], 'No diagnostic pytest selector may become full acceptance');
});

function vitest(mode) {
  const dir = join(evidence, `vitest-${mode}`);
  mkdirSync(dir);
  const spec = join(dir, 'case.test.mjs'),
    config = join(dir, 'vitest.config.mjs');
  const api = pathToFileURL(resolve(root, 'node_modules/vitest/dist/index.js')).href;
  const focused = mode === 'only' ? '.only' : '';
  writeFileSync(
    spec,
    `import{test,expect}from${JSON.stringify(api)};test${focused}('keep',()=>expect(1).toBe(1));test('other',()=>expect(2).toBe(2));\n`,
  );
  writeFileSync(
    config,
    'export default ' +
      JSON.stringify({
        root: dir,
        test: {
          include: ['case.test.mjs'],
          pool: 'forks',
          maxWorkers: 1,
          allowOnly: true,
          reporters: [resolve(root, 'scripts/ci/vitest-receipt-reporter.mjs')],
        },
      }) +
      ';\n',
  );
  return result(
    process.execPath,
    [
      resolve(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      config,
      ...(mode === 'filtered' ? ['--testNamePattern', 'keep'] : []),
    ],
    dir,
    'vitest',
    mode,
  );
}
test('real Vitest focus and testNamePattern controls cannot promote partial execution', () => {
  const good = vitest('pass');
  assert.equal(good.status, 0);
  assert.equal(good.receipt.version, viVersion);
  assert.equal(good.receipt.collected.length, 2);
  requireFrameworkReceipt(good.receipt, 'vitest');
  for (const mode of ['filtered', 'only']) {
    const { receipt } = vitest(mode);
    assert.equal(receipt.fullAcceptance, false, mode);
    assert.throws(() => requireFrameworkReceipt(receipt, 'vitest'));
  }
});

const universe = (files, patterns) => ({
  patterns,
  skipDirectories: ['node_modules'],
  excludePrefixes: [],
  files,
});
test('the reviewed framework rosters are the exact real-tree discovery universes and file counts', () => {
  assert.deepEqual([...FRAMEWORK_GATES].sort(), [
    'corpus-pytest',
    'e2e',
    'export',
    'reading-facets',
    'replay',
    'vitest',
  ]);
  const counts = {};
  for (const gate of FRAMEWORK_GATES) {
    const roster = frameworkGateRoster(gate);
    requireUniverse(root, roster.universe);
    for (const file of roster.files) assert(roster.universe.files.includes(file), file);
    counts[gate] = [roster.files.length, roster.universe.files.length];
  }
  assert.deepEqual(counts, {
    vitest: [151, 151],
    replay: [3, 151],
    export: [1, 151],
    e2e: [13, 13],
    'corpus-pytest': [15, 19],
    'reading-facets': [1, 1],
  });
  const corpus = frameworkGateRoster('corpus-pytest');
  assert.deepEqual(corpus.excludedWholeFiles, [
    'corpus/tests/test_aozora_realdata.py',
    'corpus/tests/test_grading_realdata.py',
    'corpus/tests/test_jmdict_realdata.py',
    'corpus/tests/test_wikinews_realdata.py',
  ]);
  for (const mixed of ['test_snow.py', 'test_kanji_data.py', 'test_yasashii.py'])
    assert(corpus.files.includes(`corpus/tests/${mixed}`), mixed);
  assert.deepEqual(frameworkGateRoster('replay').files, [
    'packages/domain/test/replay/clock-skew.test.ts',
    'packages/domain/test/replay/determinism.test.ts',
    'packages/domain/test/replay/golden.test.ts',
  ]);
  assert.deepEqual(frameworkGateRoster('export').files, [
    'packages/export/test/verify-export.test.ts',
  ]);
  assert.throws(() => frameworkGateRoster('unknown-gate'), /No reviewed framework file roster/u);
});
test('discovery universe additions, deletions, renames and symlink escapes fail closed', () => {
  const dir = join(evidence, 'universe-controls');
  const outside = join(evidence, 'universe-outside');
  mkdirSync(join(dir, 'nested'), { recursive: true });
  mkdirSync(outside, { recursive: true });
  for (const file of ['a.test.mjs', 'nested/b.test.mjs', 'helper.mjs'])
    writeFileSync(join(dir, file), '// fixture\n');
  writeFileSync(join(outside, 'c.test.mjs'), '// outside\n');
  const reviewed = universe(['a.test.mjs', 'nested/b.test.mjs'], ['**/*.test.mjs']);
  requireUniverse(dir, reviewed);
  assert.deepEqual(discoverUniverse(dir, reviewed), ['a.test.mjs', 'nested/b.test.mjs']);
  writeFileSync(join(dir, 'added.test.mjs'), '// added\n');
  assert.throws(() => requireUniverse(dir, reviewed), /discovery universe/u);
  rmSync(join(dir, 'added.test.mjs'));
  renameSync(join(dir, 'nested/b.test.mjs'), join(dir, 'nested/b2.test.mjs'));
  assert.throws(() => requireUniverse(dir, reviewed), /discovery universe/u);
  rmSync(join(dir, 'nested/b2.test.mjs'));
  assert.throws(() => requireUniverse(dir, reviewed), /discovery universe/u);
  symlinkSync(join(outside, 'c.test.mjs'), join(dir, 'nested/b.test.mjs'));
  assert.throws(() => requireUniverse(dir, reviewed), /symlink/u);
  rmSync(join(dir, 'nested/b.test.mjs'));
  writeFileSync(join(dir, 'nested/b.test.mjs'), '// fixture\n');
  symlinkSync(outside, join(dir, 'linked'));
  assert.throws(() => requireUniverse(dir, reviewed), /symlink/u);
  rmSync(join(dir, 'linked'));
  requireUniverse(dir, reviewed);
});
function vitestTree(mode, present, include) {
  const dir = join(evidence, `vitest-roster-${mode}`);
  mkdirSync(dir);
  const api = pathToFileURL(resolve(root, 'node_modules/vitest/dist/index.js')).href;
  for (const name of present)
    writeFileSync(
      join(dir, name),
      `import{test,expect}from${JSON.stringify(api)};test('${name} one',()=>expect(1).toBe(1));test('${name} two',()=>expect(2).toBe(2));\n`,
    );
  const config = join(dir, 'vitest.config.mjs');
  writeFileSync(
    config,
    'export default ' +
      JSON.stringify({
        root: dir,
        test: {
          include,
          pool: 'forks',
          maxWorkers: 1,
          reporters: [resolve(root, 'scripts/ci/vitest-receipt-reporter.mjs')],
        },
      }) +
      ';\n',
  );
  const run = result(
    process.execPath,
    [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', config],
    dir,
    'vitest',
    `roster-${mode}`,
  );
  return { ...run, dir };
}
const twoFiles = universe(['a.test.mjs', 'b.test.mjs'], ['*.test.mjs']);
test('real Vitest: a self-consistent narrowed or deleted-file run cannot satisfy the independent file roster', () => {
  const good = vitestTree('exact', ['a.test.mjs', 'b.test.mjs'], ['*.test.mjs']);
  assert.equal(good.status, 0);
  requireFrameworkReceipt(good.receipt, 'vitest');
  const admitted = requireFrameworkFiles(good.receipt, {
    root: good.dir,
    files: twoFiles.files,
    universe: twoFiles,
  });
  assert.deepEqual(admitted.files, ['a.test.mjs', 'b.test.mjs']);
  const narrowed = vitestTree('narrowed-include', ['a.test.mjs', 'b.test.mjs'], ['a.test.mjs']);
  assert.equal(narrowed.status, 0);
  assert.equal(narrowed.receipt.fullAcceptance, true, 'the narrowed run is self-consistent');
  requireFrameworkReceipt(narrowed.receipt, 'vitest');
  assert.throws(
    () =>
      requireFrameworkFiles(narrowed.receipt, {
        root: narrowed.dir,
        files: twoFiles.files,
        universe: twoFiles,
      }),
    /Independent framework scheduled files/u,
  );
  const deleted = vitestTree('deleted-spec', ['a.test.mjs'], ['*.test.mjs']);
  assert.equal(deleted.status, 0);
  requireFrameworkReceipt(deleted.receipt, 'vitest');
  assert.throws(
    () =>
      requireFrameworkFiles(deleted.receipt, {
        root: deleted.dir,
        files: twoFiles.files,
        universe: twoFiles,
      }),
    /discovery universe/u,
  );
  const reviewedDeletion = universe(['a.test.mjs'], ['*.test.mjs']);
  assert.throws(
    () =>
      requireFrameworkFiles(deleted.receipt, {
        root: deleted.dir,
        files: twoFiles.files,
        universe: reviewedDeletion,
      }),
    /outside its discovery universe/u,
  );
});
test('listed-but-uncollected, duplicate and escaped framework paths are rejected after a complete receipt', () => {
  const good = vitestTree('mutations', ['a.test.mjs', 'b.test.mjs'], ['*.test.mjs']);
  const roster = { root: good.dir, files: twoFiles.files, universe: twoFiles };
  const b = join(good.dir, 'b.test.mjs');
  const clone = () => globalThis.structuredClone(good.receipt);
  const uncollected = clone();
  const dropped = new Set(uncollected.collected.filter((t) => t.file === b).map((t) => t.id));
  uncollected.collected = uncollected.collected.filter((t) => !dropped.has(t.id));
  uncollected.completed = uncollected.completed.filter((t) => !dropped.has(t.id));
  requireFrameworkReceipt(uncollected, 'vitest');
  assert.throws(
    () => requireFrameworkFiles(uncollected, roster),
    /Independent framework collected files/u,
  );
  const duplicate = clone();
  const spelled = join(good.dir, '.', 'nested', '..', 'a.test.mjs').replace(
    good.dir,
    `${good.dir}/.`,
  );
  duplicate.scheduledFiles = duplicate.scheduledFiles.map((f) => (f === b ? spelled : f));
  for (const row of duplicate.files) if (row.path === b) Object.assign(row, fileEvidence(spelled));
  requireFrameworkReceipt(duplicate, 'vitest');
  assert.throws(() => requireFrameworkFiles(duplicate, roster), /duplicate observed ID/u);
  const outside = join(evidence, 'vitest-roster-escape');
  mkdirSync(outside);
  const copy = join(outside, 'b.test.mjs');
  writeFileSync(copy, readFileSync(b));
  const escaped = clone();
  escaped.scheduledFiles = escaped.scheduledFiles.map((f) => (f === b ? copy : f));
  for (const row of escaped.files) if (row.path === b) row.path = copy;
  for (const row of escaped.collected) if (row.file === b) row.file = copy;
  requireFrameworkReceipt(escaped, 'vitest');
  assert.throws(() => requireFrameworkFiles(escaped, roster), /escapes the candidate root/u);
});
function playwrightTree(mode, testDir) {
  const dir = join(evidence, `playwright-roster-${mode}`);
  mkdirSync(join(dir, 'lane'), { recursive: true });
  const prefix = `const {test,expect}=require(${JSON.stringify(require.resolve('@playwright/test'))});\n`;
  writeFileSync(join(dir, 'a.spec.cjs'), prefix + "test('a',()=>expect(1).toBe(1));");
  writeFileSync(join(dir, 'lane/b.spec.cjs'), prefix + "test('b',()=>expect(2).toBe(2));");
  const config = join(dir, 'playwright.config.cjs');
  writeFileSync(
    config,
    'module.exports=' +
      JSON.stringify({
        testDir: join(dir, testDir),
        testMatch: '**/*.spec.cjs',
        workers: 1,
        retries: 0,
        outputDir: join(dir, 'results'),
        reporter: [[reporter]],
      }) +
      ';\n',
  );
  const run = result(
    process.execPath,
    [require.resolve('@playwright/test/cli'), 'test', '--config', config],
    dir,
    'playwright',
    `roster-${mode}`,
  );
  return { ...run, dir };
}
test('real Playwright: a narrowed testDir with a self-consistent receipt cannot satisfy the file roster', () => {
  const reviewed = universe(['a.spec.cjs', 'lane/b.spec.cjs'], ['**/*.spec.cjs']);
  const good = playwrightTree('exact', '.');
  assert.equal(good.status, 0);
  requireFrameworkReceipt(good.receipt, 'playwright');
  requireFrameworkFiles(good.receipt, {
    root: good.dir,
    files: reviewed.files,
    universe: reviewed,
  });
  const narrowed = playwrightTree('narrowed-testdir', 'lane');
  assert.equal(narrowed.status, 0);
  requireFrameworkReceipt(narrowed.receipt, 'playwright');
  assert.throws(
    () =>
      requireFrameworkFiles(narrowed.receipt, {
        root: narrowed.dir,
        files: reviewed.files,
        universe: reviewed,
      }),
    /Independent framework scheduled files/u,
  );
});
function pytestTree(mode, selection, ignore = []) {
  const dir = join(evidence, `pytest-roster-${mode}`);
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'tests/test_a.py'), 'def test_a(): assert True\n');
  writeFileSync(
    join(dir, 'tests/test_b.py'),
    'import pytest\ndef test_b(): assert True\n@pytest.mark.realdata\ndef test_b_real(): assert True\n',
  );
  writeFileSync(
    join(dir, 'tests/test_c_realdata.py'),
    'import pytest\npytestmark = pytest.mark.realdata\ndef test_c(): assert True\n',
  );
  writeFileSync(
    join(dir, 'pytest.ini'),
    '[pytest]\nmarkers =\n    realdata: needs downloaded upstream data\n',
  );
  if (ignore.length)
    writeFileSync(join(dir, 'tests/conftest.py'), `collect_ignore = ${JSON.stringify(ignore)}\n`);
  const run = result(
    python,
    [
      '-m',
      'pytest',
      '-q',
      '-p',
      'no:cacheprovider',
      '-p',
      'vh_pytest_receipt',
      '--rootdir',
      dir,
      ...selection,
      '-m',
      'not realdata',
    ],
    dir,
    'pytest',
    `roster-${mode}`,
  );
  return { ...run, dir };
}
test('actual pytest: not-realdata keeps mixed files mandatory, and a path subset cannot satisfy the roster', () => {
  const reviewed = universe(
    ['tests/test_a.py', 'tests/test_b.py', 'tests/test_c_realdata.py'],
    ['tests/**/test_*.py'],
  );
  const roster = {
    files: ['tests/test_a.py', 'tests/test_b.py'],
    excludedWholeFiles: ['tests/test_c_realdata.py'],
    universe: reviewed,
  };
  const good = pytestTree('exact', ['tests']);
  assert.equal(good.status, 0);
  requireFrameworkReceipt(good.receipt, 'pytest');
  assert.equal(good.receipt.collected.length, 2, 'only the two unmarked tests are selected');
  requireFrameworkFiles(good.receipt, { root: good.dir, ...roster });
  assert.throws(
    () =>
      requireFrameworkFiles(good.receipt, {
        root: good.dir,
        files: reviewed.files,
        universe: reviewed,
      }),
    /Independent framework scheduled files/u,
  );
  assert.throws(
    () =>
      requireFrameworkFiles(good.receipt, {
        root: good.dir,
        files: ['tests/test_a.py'],
        excludedWholeFiles: ['tests/test_b.py', 'tests/test_c_realdata.py'],
        universe: reviewed,
      }),
    /Independent framework scheduled files/u,
  );
  const ignored = pytestTree('collect-ignore', ['tests'], ['test_b.py']);
  assert.equal(ignored.status, 0);
  assert.equal(ignored.receipt.fullAcceptance, true, 'config reduction is self-consistent');
  requireFrameworkReceipt(ignored.receipt, 'pytest');
  assert.throws(
    () => requireFrameworkFiles(ignored.receipt, { root: ignored.dir, ...roster }),
    /Independent framework scheduled files/u,
  );
  const subset = pytestTree('path-subset', ['tests/test_a.py']);
  assert.equal(subset.status, 0);
  assert.equal(subset.receipt.fullAcceptance, true, 'a path subset is self-consistent');
  requireFrameworkReceipt(subset.receipt, 'pytest');
  assert.throws(
    () => requireFrameworkFiles(subset.receipt, { root: subset.dir, ...roster }),
    /Independent framework scheduled files/u,
  );
});
