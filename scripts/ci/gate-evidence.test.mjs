import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  appendFileSync,
  existsSync,
  copyFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { runGates } from '../verify-release-gates.mjs';
import { supplementalGates } from './supplemental.mjs';
import { frameworkGateRoster } from './framework-rosters.mjs';
import {
  registerGateAdapters,
  gateEvidenceDeclaration,
  validateGateEvidence,
  evidenceInvocation,
  requireApprovedInvocation,
} from './gate-evidence.mjs';
import {
  acceptanceEnvironment,
  exactIds,
  digest,
  requireGateAttemptEvidence,
  sourceSnapshot,
} from './verification-admission.mjs';
import { grammarFixture } from '../../prototypes/corridor/tools/vh-word-grammar-fixture.mjs';
const root = fileURLToPath(new globalThis.URL('../..', import.meta.url));
const parent =
  process.env.KAIRO_EVIDENCE_DIR ||
  join(homedir(), '.dharma/bunki/verifier-receipts/gate-evidence-tests');
mkdirSync(parent, { recursive: true });
const fixture = mkdtempSync(join(parent, 'gate-evidence-fixtures-'));
const producer = join(fixture, 'producer.mjs');
writeFileSync(
  producer,
  `import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync}from'node:child_process';
const out=process.env.KAIRO_EVIDENCE_DIR,mode=process.env.VH_TEST_MODE,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const directory=path.join(out,'run-one');fs.mkdirSync(directory,{recursive:true});
if(mode==='missing')process.exit(0);
const report={runId:process.env.KAIRO_GATE_RUN_ID,gitSha:process.env.VH_TEST_SOURCE,verifierSha256:sha(fs.readFileSync(new globalThis.URL(import.meta.url))),rows:['a','b'],phase:'run-one/phase.json',sourceSha256:process.env.VH_TEST_INITIAL_SOURCE,ambient:Object.fromEntries(['KAIRO_FILE_VIEWPORT','KAIRO_SKY_NEGATIVE','KAIRO_RECORD_HINT_ONLY'].map(k=>[k,process.env[k]??null]))};
if(mode==='empty-roster')report.rows=[];if(mode==='duplicate-roster')report.rows=['a','a'];
if(mode==='wrong-source')report.gitSha='wrong';if(mode==='wrong-nonce')report.runId='stale';
const file=path.join(directory,'report.json');fs.writeFileSync(file,mode==='empty'?'':JSON.stringify(report));
if(mode==='stale')fs.utimesSync(file,new Date(0),new Date(0));
if(mode==='duplicate'){fs.mkdirSync(path.join(out,'run-two'));fs.writeFileSync(path.join(out,'run-two/report.json'),JSON.stringify(report));}
if(mode!=='missing-phase')fs.writeFileSync(path.join(directory,'phase.json'),JSON.stringify({runId:mode==='phase-wrong-nonce'?'stale':process.env.KAIRO_GATE_RUN_ID,completed:true,passed:true}));
if(mode==='symlink-ancestor'){const external=path.join(out,'..','..','external-'+process.env.KAIRO_GATE_RUN_ID);fs.renameSync(directory,external);fs.symlinkSync(external,directory,'dir');}
if(mode==='source-mutated')fs.appendFileSync(path.join(process.cwd(),'prototypes/corridor/corridor.js'),'\\n// fixture-only mutation');
if(mode==='timeout')setInterval(()=>{},1000);
`,
);
const name = 'vh-fixture-evidence';
const fixtureAdapter = {
  producer,
  paths: ['run-*/report.json'],
  expectedCases: () => ['a', 'b'],
  validate(r, c) {
    const errors = [];
    try {
      assert.equal(r.runId, c.runId);
      assert.equal(r.gitSha, c.gitSha);
      assert.equal(r.verifierSha256, c.verifierSha256);
      exactIds(['a', 'b'], r.rows);
      const phase = c.readReport(r.phase);
      assert.equal(phase.runId, c.runId);
      assert.equal(phase.completed, true);
      assert.equal(phase.passed, true);
      assert(
        Object.values(r.ambient).every((v) => v === null),
        'ambient scope leaked',
      );
      if (r.sourceSha256) {
        assert.equal(c.sourceVerifiedBeforeAndAfter, true);
        assert.equal(r.sourceSha256, c.sourceSha256);
      }
    } catch (e) {
      errors.push(e.message);
    }
    return { passed: !errors.length, errors, expectedCases: ['a', 'b'], observedCases: r.rows };
  },
};
registerGateAdapters({ [name]: fixtureAdapter });
const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
function fixtureGate(
  out,
  { mode = 'good', sourceSha = null, gateName = name, callerSha = gitSha } = {},
) {
  return {
    name: gateName,
    command: process.execPath,
    args: [producer],
    requiredPath: producer,
    timeoutMs: mode === 'timeout' ? 700 : 5000,
    env: {
      KAIRO_EVIDENCE_DIR: join(out, gateName),
      VH_TEST_MODE: mode,
      VH_TEST_SOURCE: callerSha,
      ...(sourceSha ? { VH_TEST_INITIAL_SOURCE: sourceSha } : {}),
    },
  };
}
async function attempt(
  mode,
  {
    fixtureRoot = root,
    sourceSha = null,
    gateName = name,
    callerSha = gitSha,
    out = mkdtempSync(join(fixture, `${mode}-`)),
  } = {},
) {
  const gate = fixtureGate(out, { mode, sourceSha, gateName, callerSha });
  const receipt = await runGates({
    gates: [gate],
    root: fixtureRoot,
    out,
    source: { sha: callerSha },
  });
  return { receipt, gate: receipt.gates[0], out };
}
function fakeSource() {
  const isolated = mkdtempSync(join(fixture, 'source-only-')),
    file = join(isolated, 'prototypes/corridor/corridor.js');
  mkdirSync(join(isolated, 'prototypes/corridor'), { recursive: true });
  writeFileSync(file, '// disposable source-only fixture\n');
  // Synthetic Git observation seam: the real sourceSnapshot/runGate code observes
  // HEAD and before/after diff bytes without initializing or committing a repository.
  const bin = join(isolated, 'bin');
  mkdirSync(bin);
  const shim = join(bin, 'git');
  writeFileSync(
    shim,
    `#!${process.execPath}\nimport fs from 'node:fs';const args=process.argv.slice(2);if(args[0]==='rev-parse')process.stdout.write(args[1]==='--show-toplevel'?process.cwd():${JSON.stringify(gitSha)});else if(args[0]==='diff')process.stdout.write(fs.readFileSync(${JSON.stringify(file)}));else if(!['status','ls-files'].includes(args[0]))process.exit(2);\n`,
  );
  chmodSync(shim, 0o755);
  return { isolated, file, bin, sourceSha: digest(readFileSync(file)) };
}
test('real admission requires fresh complete reports and every phase receipt despite successful process exits', async () => {
  const good = await attempt('good');
  assert.equal(good.receipt.status, 'passed');
  assert.equal(good.gate.proof.receipts.length, 2);
  requireGateAttemptEvidence(good.gate, { gitSha, artifactSha256: null });
  for (const mode of [
    'missing',
    'empty',
    'stale',
    'duplicate',
    'empty-roster',
    'duplicate-roster',
    'wrong-source',
    'wrong-nonce',
    'missing-phase',
    'phase-wrong-nonce',
    'symlink-ancestor',
  ]) {
    const run = await attempt(mode);
    assert.equal(run.gate.processExitCode, 0, mode);
    assert.equal(run.gate.status, 'incomplete', mode);
    assert.equal(run.gate.evidenceReceipt, undefined, mode);
    assert.equal(run.receipt.status, 'failed', mode);
  }
});
test('a completed producer report cannot promote a process that times out', async () => {
  const run = await attempt('timeout');
  assert.equal(run.gate.status, 'timed-out');
  assert.equal(run.gate.exitCode, 124);
  assert.equal(run.gate.evidenceReceipt, undefined);
  assert(
    readFileSync(join(run.out, name, 'run-one/report.json')).length > 0,
    'producer emitted evidence before hanging',
  );
});
test('missing, wrong source, wrong nonce or corrupted outer attempt evidence cannot be admitted', async () => {
  const run = await attempt('good');
  for (const mutate of [
    (g) => delete g.evidenceReceipt,
    (g) => (g.evidenceReceipt.runId = 'stale'),
    (g) => (g.evidenceReceipt.gitSha = 'wrong'),
    (g) => (g.evidenceReceipt.fullAcceptance = false),
    (g) => (g.evidenceReceipt.proof.receipts = []),
    (g) => (g.evidenceReceipt.proof.receipts[0].bytes = 0),
  ]) {
    const bad = globalThis.structuredClone(run.gate);
    mutate(bad);
    if (bad.evidenceReceipt)
      bad.evidenceReceiptSha256 = digest(JSON.stringify(bad.evidenceReceipt));
    assert.throws(() => requireGateAttemptEvidence(bad, { gitSha, artifactSha256: null }));
  }
});
test('all discovered ambient viewport/case/fault selectors are cleared at acceptance', async () => {
  const narrow = ['KAIRO_FILE_VIEWPORT', 'KAIRO_SKY_NEGATIVE', 'KAIRO_RECORD_HINT_ONLY'];
  const env = acceptanceEnvironment(Object.fromEntries(narrow.map((key) => [key, 'narrow'])));
  for (const key of narrow) assert.equal(env[key], undefined, key);
  const saved = Object.fromEntries(narrow.map((key) => [key, process.env[key]]));
  try {
    for (const key of narrow) process.env[key] = 'narrow';
    assert.equal((await attempt('good')).gate.status, 'passed');
  } finally {
    for (const key of narrow)
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
  }
});
test('source-only admission detects a changed source snapshot, with a clean identical-source control', async () => {
  const { isolated, file, bin, sourceSha } = fakeSource(),
    prior = process.env.PATH;
  process.env.PATH = bin + ':' + prior;
  try {
    const clean = await attempt('good', { fixtureRoot: isolated, sourceSha });
    assert.equal(clean.gate.status, 'passed', 'clean observed source boundary');
    const run = await attempt('source-mutated', { fixtureRoot: isolated, sourceSha });
    assert.notEqual(
      digest(readFileSync(file)),
      sourceSha,
      'child actually mutated only disposable fixture source',
    );
    assert.equal(run.gate.status, 'incomplete', 'source drift must reject complete reports');
    assert.match(run.gate.detail, /Source\/input tree changed/u);
    assert.equal(run.gate.evidenceReceipt, undefined);
  } finally {
    process.env.PATH = prior;
  }
});
test('a caller and producer agreeing on the wrong source SHA cannot override observed HEAD', async () => {
  const { isolated, bin, sourceSha } = fakeSource(),
    prior = process.env.PATH;
  process.env.PATH = bin + ':' + prior;
  try {
    assert.equal(
      (await attempt('good', { fixtureRoot: isolated, sourceSha })).receipt.status,
      'passed',
    );
    const out = mkdtempSync(join(fixture, 'wrong-caller-sha-'));
    await assert.rejects(
      () => attempt('good', { fixtureRoot: isolated, sourceSha, callerSha: 'f'.repeat(40), out }),
      /Declared source SHA differs from actual HEAD/u,
    );
    assert.equal(
      existsSync(join(out, name, 'run-one/report.json')),
      false,
      'reject the false source claim before launching the producer',
    );
  } finally {
    process.env.PATH = prior;
  }
});
test('between-gate source drift prevents the next launch and invalidates prior accepted attempts', async () => {
  for (const mutate of [false, true]) {
    const { isolated, file, bin, sourceSha } = fakeSource(),
      prior = process.env.PATH;
    process.env.PATH = bin + ':' + prior;
    try {
      const firstName = `vh-fixture-between-${mutate}-first`,
        secondName = `vh-fixture-between-${mutate}-second`;
      let completedValidation = false;
      registerGateAdapters({
        [firstName]: {
          ...fixtureAdapter,
          validate(r, c) {
            const result = fixtureAdapter.validate(r, c);
            assert.equal(
              result.passed,
              true,
              'first gate evidence must be valid before changing source',
            );
            completedValidation = true;
            // runGate has already checked sourceAfter; this crosses the otherwise unchecked
            // gap before the next gate. Mutate only the disposable source observation fixture.
            if (mutate) appendFileSync(file, '\n// fixture mutation between accepted gates\n');
            return result;
          },
        },
        [secondName]: fixtureAdapter,
      });
      const out = mkdtempSync(join(fixture, `between-${mutate}-`));
      const gates = [firstName, secondName].map((gateName) =>
        fixtureGate(out, { gateName, sourceSha }),
      );
      const result = await runGates({ gates, root: isolated, out, source: { sha: gitSha } });
      assert.equal(completedValidation, true);
      if (!mutate) {
        assert.equal(result.status, 'passed');
        assert.deepEqual(result.sourceAfter, result.sourceBefore);
        for (const gate of result.gates)
          requireGateAttemptEvidence(gate, { gitSha, artifactSha256: null });
        continue;
      }
      assert.equal(result.status, 'failed');
      assert.match(result.sourceBoundaryError, /Source\/input tree changed across the battery/u);
      assert.notDeepEqual(result.sourceAfter, result.sourceBefore);
      assert.match(result.gates[1].detail, /initial battery snapshot/u);
      assert.equal(
        existsSync(join(out, secondName, 'run-one/report.json')),
        false,
        'second gate must not launch on changed source',
      );
      const first = result.gates[0],
        saved = JSON.parse(readFileSync(first.attemptReceipt, 'utf8'));
      for (const gate of [first, saved]) {
        assert.equal(
          gate.status,
          'incomplete',
          'earlier success is invalidated in memory and on disk',
        );
        assert.equal(gate.exitCode, 78);
        assert.equal(gate.proof, null);
        assert.equal(Boolean(gate.evidenceReceipt), false);
        assert.equal(Boolean(gate.evidenceReceiptSha256), false);
        assert.match(gate.detail, /Source boundary failed/u);
        assert.throws(() => requireGateAttemptEvidence(gate, { gitSha, artifactSha256: null }));
      }
    } finally {
      process.env.PATH = prior;
    }
  }
});
test('unknown producer and empty or duplicate battery rosters fail closed; learning entries dispatch actual adapters', async () => {
  assert.throws(
    () =>
      gateEvidenceDeclaration(
        { name: 'unknown-fixture', command: process.execPath, args: ['-e', 'process.exit(0)'] },
        root,
        fixture,
      ),
    /No required evidence contract/u,
  );
  await assert.rejects(
    () => runGates({ gates: [], root, out: join(fixture, 'empty') }),
    /empty battery/u,
  );
  await assert.rejects(
    () =>
      runGates({
        gates: [{ name: 'duplicate' }, { name: 'duplicate' }],
        root,
        out: join(fixture, 'duplicate'),
      }),
    /unique/u,
  );
  for (const kind of ['reader-doors', 'record-depth'])
    for (const engine of ['chromium', 'webkit']) {
      const gate = { name: `${kind}-${engine}`, command: process.execPath, args: [] };
      assert.deepEqual(gateEvidenceDeclaration(gate, root, fixture), {
        kind: 'adapter',
        name: gate.name,
      });
    }
  assert.deepEqual(
    gateEvidenceDeclaration(
      { name: 'report-delivery', command: process.execPath, args: [] },
      root,
      fixture,
    ),
    { kind: 'adapter', name: 'report-delivery' },
  );
  for (const engine of ['chromium', 'webkit'])
    assert.throws(
      () =>
        gateEvidenceDeclaration(
          { name: `report-delivery-${engine}`, command: process.execPath, args: [] },
          root,
          fixture,
        ),
      /No required evidence contract/u,
    );
});

test('independent registry rejects an adapter that falsely promotes an empty or duplicate completion roster', async () => {
  for (const [suffix, observed] of [
    ['empty', []],
    ['duplicate', ['a', 'a']],
    ['partial', ['a']],
  ]) {
    const gateName = `vh-fixture-${suffix}-adapter`;
    registerGateAdapters({
      [gateName]: {
        producer,
        paths: ['run-*/report.json'],
        expectedCases: () => ['a', 'b'],
        validate() {
          return { passed: true, errors: [], expectedCases: observed, observedCases: observed };
        },
      },
    });
    const run = await attempt('good', { gateName });
    assert.equal(run.gate.status, 'incomplete', suffix);
    assert.equal(run.gate.evidenceReceipt, undefined, suffix);
  }
});

test('framework evidence binds its attempt nonce and actual framework/version', () => {
  const out = mkdtempSync(join(fixture, 'framework-')),
    path = join(out, 'framework.json'),
    gate = { name: 'export', command: 'npm', args: ['run', 'verify:export'] },
    declaration = { kind: 'framework', path };
  const context = {
    root,
    out,
    startedAt: new Date(Date.now() - 1000).toISOString(),
    runId: 'framework-current',
    gitSha,
    processExitCode: 0,
  };
  const clean = () => ({
    schemaVersion: 1,
    kind: 'bunki-framework-suite',
    framework: 'vitest',
    version: '4.0.18',
    runId: context.runId,
    fullAcceptance: true,
    errors: [],
    filtered: false,
    scheduledFiles: [resolve(root, 'packages/export/test/verify-export.test.ts')],
    files: [
      {
        path: resolve(root, 'packages/export/test/verify-export.test.ts'),
        sha256: digest(readFileSync(resolve(root, 'packages/export/test/verify-export.test.ts'))),
      },
    ],
    collected: [
      { id: 'one', file: resolve(root, 'packages/export/test/verify-export.test.ts'), name: 'one' },
    ],
    completed: [{ id: 'one', status: 'passed', retry: 0, expectedFailure: false }],
  });
  writeFileSync(path, JSON.stringify(clean()));
  assert.doesNotThrow(() => validateGateEvidence(gate, declaration, context));
  for (const mutate of [
    (r) => delete r.runId,
    (r) => (r.runId = 'stale'),
    (r) => delete r.version,
    (r) => (r.framework = 'playwright'),
  ]) {
    const report = clean();
    mutate(report);
    writeFileSync(path, JSON.stringify(report));
    assert.throws(() => validateGateEvidence(gate, declaration, context));
  }
});

test('release-runner requires the full independent check roster, not arbitrary passing checks per group', () => {
  const out = mkdtempSync(join(fixture, 'release-roster-')),
    path = join(out, 'release.json');
  const gate = { name: 'release-verifier', args: [] },
    declaration = { kind: 'release-runner', path };
  const context = {
    root,
    out,
    startedAt: new Date(Date.now() - 1000).toISOString(),
    runId: 'release-current',
    gitSha,
    processExitCode: 0,
  };
  // Frozen from the real release self-test; these are the exact 30 named checks
  // across seven groups, not a success inferred from group/count agreement.
  const roster = JSON.parse(
    readFileSync(new globalThis.URL('./vh-release-check-roster.json', import.meta.url), 'utf8'),
  );
  const groups = globalThis.structuredClone(roster),
    checks = groups.flatMap((g) => g.checks);
  assert.equal(groups.length, 7);
  assert.equal(checks.length, 30);
  const complete = { runId: context.runId, gitSha, groups, checks, passed: checks.length };
  writeFileSync(path, JSON.stringify(complete));
  assert.doesNotThrow(() => validateGateEvidence(gate, declaration, context));
  const arbitrary = roster.map((g) => ({
    id: g.id,
    checks: [`arbitrary passing check for ${g.id}`],
  }));
  const incomplete = {
    ...complete,
    groups: arbitrary,
    checks: arbitrary.flatMap((g) => g.checks),
    passed: 7,
  };
  writeFileSync(path, JSON.stringify(incomplete));
  assert.throws(() => validateGateEvidence(gate, declaration, context), /Release .* checks/u);
});

test('supplemental returned descriptors preserve both-engine scope and route Python evidence to its gate directory', () => {
  const out = join(fixture, 'descriptor-only'),
    gates = supplementalGates(out);
  for (const name of ['report-delivery', 'redesign-foundation', 'redesign-docks'])
    assert.equal(gates.find((g) => g.name === name).env.KAIRO_BROWSER, 'all', name);
  assert.equal(
    gates.find((g) => g.name === 'deck-segment-overrides').env.KAIRO_EVIDENCE_DIR,
    join(out, 'deck-segment-overrides'),
  );
});

test('word-grammar admission binds its invocation argv, declared engine, nonce and re-adjudicated controls', () => {
  const tool = 'prototypes/corridor/tools/verify-word-grammar.mjs';
  const canonical = {
    name: 'word-grammar',
    command: process.execPath,
    args: [tool, '--controls'],
    requiredPath: tool,
    env: { KAIRO_BROWSER: 'chromium' },
  };
  const fixtureValue = grammarFixture(['chromium']);
  const clean = () => ({
    schemaVersion: 1,
    runId: 'wg-current',
    engines: ['chromium'],
    requestedScope: { argv: ['--controls'], narrow: [], fullRequested: true },
    walks: fixtureValue.walks,
    g6Completed: ['chromium'],
    rows: fixtureValue.rows,
    controls: fixtureValue.controls,
    artifactSha256: 'a'.repeat(64),
    verifierSha256: 'b'.repeat(64),
    browserVersions: { chromium: '131.0.6778.33' },
    fullAcceptance: true,
  });
  const attempt = (
    mutate = () => {},
    { gate = canonical, context: overrides = {}, startedAt = Date.now() - 1000 } = {},
  ) => {
    const out = mkdtempSync(join(fixture, 'word-grammar-'));
    const declaration = gateEvidenceDeclaration(gate, root, out);
    assert.equal(declaration.kind, 'word-grammar');
    const report = clean();
    mutate(report);
    mkdirSync(join(out, gate.name), { recursive: true });
    writeFileSync(declaration.path, JSON.stringify(report));
    return validateGateEvidence(gate, declaration, {
      root,
      out,
      startedAt: new Date(startedAt).toISOString(),
      runId: 'wg-current',
      gitSha,
      processExitCode: 0,
      engine: 'chromium',
      artifactSha256: 'a'.repeat(64),
      verifierSha256: 'b'.repeat(64),
      runtimeFiles: fixtureValue.runtimeFiles,
      ...overrides,
    });
  };
  assert.equal(attempt().obligation.fullAcceptance, true);
  const narrowed = { ...canonical, args: [tool, '--controls', '--g5-only'] };
  assert.throws(
    () => attempt((r) => (r.requestedScope.argv = narrowed.args.slice(1)), { gate: narrowed }),
    /full control schedule/u,
  );
  assert.throws(
    () => attempt((r) => (r.requestedScope.argv = ['--controls', '--g3-only'])),
    /argv differs/u,
  );
  assert.throws(() => attempt((r) => delete r.requestedScope), /argv differs/u);
  assert.throws(
    () => attempt(() => {}, { context: { engine: 'webkit' } }),
    /Word-grammar engines/u,
  );
  assert.throws(
    () => attempt((r) => (r.engines = ['chromium', 'webkit'])),
    /Word-grammar engines/u,
  );
  assert.throws(() => attempt((r) => (r.browserVersions = {})), /browser version/u);
  assert.throws(() => attempt((r) => (r.runId = 'wg-previous')));
  assert.throws(() => attempt((r) => delete r.runId));
  assert.throws(() => attempt(() => {}, { context: { runId: 'wg-next' } }));
  assert.throws(() => attempt(() => {}, { startedAt: Date.now() + 60_000 }), /Stale receipt/u);
  assert.throws(
    () => attempt(() => {}, { context: { runtimeFiles: undefined } }),
    /artifact manifest/u,
  );
  assert.throws(
    () =>
      attempt((r) => {
        const control = r.controls.find((row) => row.id === 'second-hold-unkeeps');
        control.restore[0].ok = false;
      }),
    /G1–G6 candidate and control/u,
  );
  assert.throws(
    () => attempt((r) => (r.controls = r.controls.filter((row) => row.id !== 'G1.page-capped'))),
    /G1–G6 candidate and control/u,
  );
});

test('an ancestor checkout is never the source identity of a disposable fixture, and declared source cannot use that seam', async () => {
  const parent = mkdtempSync(join(fixture, 'ancestor-'));
  const child = join(parent, 'nested-fixture');
  mkdirSync(child);
  // An explicit Git observation fixture gives the parent a HEAD, while the child
  // belongs to that ancestor rather than being its own checkout. No repo is created.
  const bin = join(parent, 'bin');
  mkdirSync(bin);
  const shim = join(bin, 'git');
  writeFileSync(
    shim,
    `#!${process.execPath}\nconst a=process.argv.slice(2);if(a[0]==='rev-parse')process.stdout.write(a[1]==='--show-toplevel'?${JSON.stringify(parent)}:${JSON.stringify(gitSha)});else if(!['status','diff','ls-files'].includes(a[0]))process.exit(2);\n`,
  );
  chmodSync(shim, 0o755);
  const prior = process.env.PATH;
  process.env.PATH = bin + ':' + prior;
  try {
    assert.equal(sourceSnapshot(parent).head, gitSha);
    assert.equal(sourceSnapshot(child), null, 'ancestor HEAD cannot identify child fixture');
    const gate = {
      name: 'ancestor-probe',
      command: process.execPath,
      args: ['-e', 'process.exit(0)'],
      fixtureReceipt: 'process-probe',
    };
    const good = await runGates({ gates: [gate], root: child, out: join(child, 'probe') });
    assert.equal(good.gates[0].status, 'passed');
    assert.equal(good.sourceBefore, null);
    assert.throws(
      () => requireGateAttemptEvidence(good.gates[0], { gitSha: null, artifactSha256: null }),
      /Test-only process fixture/u,
    );
    await assert.rejects(
      () =>
        runGates({
          gates: [gate],
          root: child,
          out: join(child, 'declared'),
          source: { sha: gitSha },
        }),
      /actual checkout rooted/u,
    );
    await assert.rejects(
      () =>
        runGates({
          gates: [gate],
          root: parent,
          out: join(parent, 'wrong'),
          source: { sha: '0'.repeat(40) },
        }),
      /differs from actual HEAD/u,
    );
  } finally {
    process.env.PATH = prior;
  }
});

test('raw Node-suite options are rejected before path resolution or any fixture test execution', () => {
  const dir = mkdtempSync(join(fixture, 'raw-node-'));
  const testFile = join(dir, 'positive.test.mjs'),
    marker = join(dir, 'executed');
  writeFileSync(
    testFile,
    `import{test}from'node:test';import{writeFileSync}from'node:fs';test('fixture only',()=>writeFileSync(${JSON.stringify(marker)},'ran'));`,
  );
  const runner = resolve(root, 'scripts/ci/run-node-suite.mjs');
  for (const [i, files] of [
    [testFile, '--test-name-pattern=absent'],
    [''],
    [testFile, testFile],
    [testFile, `${dir}/./positive.test.mjs`],
  ].entries()) {
    const result = spawnSync(
      process.execPath,
      [runner, '--out', join(dir, `bad-${i}.json`), '--', ...files],
      { encoding: 'utf8', env: acceptanceEnvironment(process.env) },
    );
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(marker), false);
  }
  const report = join(dir, 'good.json');
  const good = spawnSync(process.execPath, [runner, '--out', report, '--', testFile], {
    encoding: 'utf8',
    env: acceptanceEnvironment(process.env),
  });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(existsSync(marker), true);
  assert.equal(JSON.parse(readFileSync(report)).fullAcceptance, true);
});

test('real Node wrapper and pytest instrumentation receipts record the actual safe invocation and reject altered args or environment', async () => {
  const dir = mkdtempSync(join(fixture, 'actual-invocation-'));
  mkdirSync(join(dir, 'scripts/ci'), { recursive: true });
  for (const file of ['run-node-suite.mjs', 'verification-admission.mjs', 'vh_pytest_receipt.py'])
    copyFileSync(resolve(root, 'scripts/ci', file), join(dir, 'scripts/ci', file));
  writeFileSync(
    join(dir, 'actual.test.mjs'),
    `import{test}from'node:test';import assert from'node:assert/strict';test('actual node child',()=>{assert.equal(process.env.KAIRO_BROWSER,'chromium');assert(process.env.KAIRO_GATE_RUN_ID)});`,
  );
  mkdirSync(join(dir, 'prototypes/corridor/tools'), { recursive: true });
  writeFileSync(
    join(dir, 'prototypes/corridor/tools/test_reading_facets.py'),
    "import os\ndef test_actual_fixture():\n assert os.environ['KAIRO_BROWSER']=='chromium'\n assert os.environ['KAIRO_GATE_RUN_ID']\n",
  );
  const cases = [
    { name: 'actual-node-fixture', command: process.execPath, args: ['--test', 'actual.test.mjs'] },
    {
      name: 'reading-facets',
      command: process.env.VH_TEST_PYTHON || 'python3',
      args: [
        '-m',
        'pytest',
        '-p',
        'no:cacheprovider',
        'prototypes/corridor/tools/test_reading_facets.py',
        '-q',
      ],
    },
  ];
  const secret = process.env.VH_PRIVATE_AMBIENT;
  process.env.VH_PRIVATE_AMBIENT = 'fixture-private-must-not-be-recorded';
  try {
    for (const gate of cases) {
      const out = join(dir, gate.name),
        declaration = gateEvidenceDeclaration(gate, dir, out);
      const actual = evidenceInvocation(gate, declaration, dir);
      requireApprovedInvocation(gate, declaration, actual, dir);
      assert.throws(
        () =>
          requireApprovedInvocation(
            gate,
            declaration,
            { ...actual, args: [...actual.args, '--test-name-pattern=none'] },
            dir,
          ),
        /Actual arguments/u,
      );
      assert.throws(
        () =>
          requireApprovedInvocation(
            gate,
            declaration,
            { ...actual, env: { ...actual.env, KAIRO_BROWSER: 'webkit' } },
            dir,
          ),
        /Injected environment/u,
      );
      const run = await runGates({ gates: [gate], root: dir, out });
      assert.equal(run.gates[0].status, 'passed', run.gates[0].detail);
      const attempt = JSON.parse(readFileSync(run.gates[0].attemptReceipt));
      assert.deepEqual(attempt.declaredInvocation.args, gate.args);
      assert.deepEqual(attempt.invocation.args, actual.args);
      assert.equal(attempt.invocation.command, actual.command);
      assert.equal(attempt.invocation.cwd, resolve(dir));
      assert.deepEqual(attempt.invocation.env, {
        KAIRO_BROWSER: 'chromium',
        ...actual.env,
        KAIRO_GATE_RUN_ID: attempt.runId,
      });
      assert.equal(
        readFileSync(run.gates[0].log, 'utf8').split('\n')[0],
        `${actual.command} ${actual.args.join(' ')}`,
      );
      assert(!JSON.stringify(attempt).includes('fixture-private-must-not-be-recorded'));
      assert.equal(
        attempt.invocation.instrumentation,
        gate.name === 'reading-facets' ? 'vh_pytest_receipt' : 'run-node-suite',
      );
    }
    for (const gate of [
      { name: 'vitest', command: 'npm', args: ['run', 'test'] },
      { name: 'e2e', command: 'npm', args: ['run', 'test:e2e', '--', '--output', '/fixture/e2e'] },
    ]) {
      const declaration = gateEvidenceDeclaration(gate, dir, '/fixture');
      const actual = evidenceInvocation(gate, declaration, dir);
      assert.match(requireApprovedInvocation(gate, declaration, actual, dir), /receipt-reporter/u);
      assert(actual.args.includes('--reporter'));
      assert.throws(
        () => requireApprovedInvocation(gate, declaration, { ...actual, args: gate.args }, dir),
        /Actual arguments/u,
      );
    }
  } finally {
    if (secret === undefined) delete process.env.VH_PRIVATE_AMBIENT;
    else process.env.VH_PRIVATE_AMBIENT = secret;
  }
});

test('real no-browser Playwright reporter runs through the actual augmented gate command and receipt boundary', async () => {
  const dir = mkdtempSync(join(fixture, 'actual-playwright-'));
  mkdirSync(join(dir, 'scripts/ci'), { recursive: true });
  for (const file of [
    'playwright-receipt-reporter.mjs',
    'framework-receipt.mjs',
    'verification-admission.mjs',
  ])
    copyFileSync(resolve(root, 'scripts/ci', file), join(dir, 'scripts/ci', file));
  const roster = frameworkGateRoster('e2e');
  for (const file of roster.files) {
    const path = join(dir, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `const {test,expect}=require(${JSON.stringify(resolve(root, 'node_modules/@playwright/test'))});test('fixture without browser',()=>{expect(process.env.KAIRO_GATE_RUN_ID).toBeTruthy();expect(process.env.KAIRO_BROWSER).toBe('chromium')});`,
    );
  }
  writeFileSync(
    join(dir, 'fixture.config.cjs'),
    "module.exports={testDir:'./apps/app/e2e',workers:1,retries:0};\n",
  );
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      scripts: {
        'test:e2e': `${quote(process.execPath)} ${quote(resolve(root, 'node_modules/@playwright/test/cli.js'))} test --config ./fixture.config.cjs`,
      },
    }),
  );
  const out = join(dir, 'evidence');
  const gate = {
    name: 'e2e',
    command: 'npm',
    args: roster.args.map((arg) => arg.replace('{out}', out)),
  };
  const declaration = gateEvidenceDeclaration(gate, dir, out);
  const actual = evidenceInvocation(gate, declaration, dir);
  assert.equal(
    requireApprovedInvocation(gate, declaration, actual, dir),
    'playwright-receipt-reporter',
  );
  const run = await runGates({ gates: [gate], root: dir, out });
  assert.equal(run.gates[0].status, 'passed', run.gates[0].detail);
  const attempt = JSON.parse(readFileSync(run.gates[0].attemptReceipt));
  assert.deepEqual(attempt.declaredInvocation.args, gate.args);
  assert.deepEqual(attempt.invocation.args, actual.args);
  assert.equal(attempt.invocation.instrumentation, 'playwright-receipt-reporter');
  assert.equal(
    readFileSync(run.gates[0].log, 'utf8').split('\n')[0],
    `${actual.command} ${actual.args.join(' ')}`,
  );
  assert.equal(run.gates[0].evidenceReceipt.proof.obligation.tests, 13);
  assert.deepEqual(run.gates[0].evidenceReceipt.proof.obligation.files, roster.files);
});
