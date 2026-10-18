import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { requireFrameworkReceipt } from './framework-receipt.mjs';
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
  const receipt = JSON.parse(readFileSync(path));
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
