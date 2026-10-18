/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { retainedReportContracts, driftFastSchedule } from './vh-retained-report-contracts.mjs';
const A = 'a'.repeat(64),
  B = 'b'.repeat(64),
  C = 'c'.repeat(64),
  H = 'd'.repeat(40);
function fixture(name) {
  const contract = retainedReportContracts[name],
    expected = contract.expectedCases();
  const context = {
    runId: 'current-attempt',
    verifierSha256: B,
    sourceSha256: C,
    sourceVerifiedBeforeAndAfter: true,
    engine: 'chromium',
    gitSha: H,
    site: '/candidate/site',
    artifactSha256: A,
    artifactVerifiedBeforeAndAfter: true,
    runtimeFiles: { 'corridor.js': C },
    args: [contract.producer],
  };
  const report = {
    schemaVersion: 1,
    runId: context.runId,
    verifierSha256: B,
    sourceSha256: C,
    sourceOnly: contract.sourceOnly || false,
    runtime: { engine: 'chromium', version: '145.0.1' },
    artifact: { path: context.site, sha256: A },
    viewport: { width: 390, height: 844 },
    fullAcceptance: true,
    head: H,
    summary: { total: expected.length, failed: 0 },
    results: expected.map((name) => ({
      name:
        name === 'C1/sentence-home'
          ? 'C1 · the sentence page walks on to the whole article it came from'
          : name,
      pass: true,
    })),
    sources: { verifier: B },
  };
  if (name.startsWith('word-'))
    Object.assign(report, {
      suite: name,
      inventory: expected.filter((id) => id !== 'inventory-exact'),
    });
  if (name === 'corridor-build') {
    report.site = '/actual-built/site';
    report.results[0].detail = {
      site: report.site,
      receipt: {
        mode: 'assembled',
        status: 'passed',
        gitSha: H,
        artifactSha256: C,
        modules: [{ inputs: [{ path: 'packages/domain/src/reading.ts', sha256: A }] }],
      },
    };
    report.results[1].detail = { mode: 'supplied', status: 'passed', artifactSha256: C };
  }
  if (name === 'drift-fast') {
    context.args = [
      'run',
      'verify:drift:fast',
      '--',
      '--out',
      '/evidence/report.json',
      '--shots',
      '/evidence/shots',
    ];
    report.schemaVersion = 2;
    report.sourceSha256 = B;
    report.mode = 'fast';
    report.gate = { scope: 'bounded PR regression slice', status: 'pass', exitCode: 0 };
    report.configuration = {
      words: 3,
      scaleNavigation: 'hosted',
      chainHops: 3,
      fuzzSeeds: [1729],
      fuzzGesturesPerSeed: 12,
      soakMs: 0,
      viewport: { width: 390, height: 844, deviceScaleFactor: 2 },
    };
    report.cases = driftFastSchedule().map((row) => ({
      ...row,
      word:
        row.word ||
        (row.round
          ? `${row.gesture.startsWith('sat-') ? 'satellite' : 'root'}-${row.round}`
          : 'observed word'),
      expected: 'named predicate completed',
      outcome: 'ok',
    }));
    report.fatalError = null;
    report.pageErrors = [];
    report.totals = { total: expected.length, ok: expected.length, violations: 0, pageErrors: 0 };
    report.coverage = {
      matrix: {
        requestedWords: 3,
        completedWords: 3,
        themes: ['北斎', '夜'],
        encodedStates: ['surface', 'bloom', 'lock', 'front-door'],
        encodedGestures: [...new Set(report.cases.map((row) => row.gesture))],
      },
      chain: { requestedHops: 3, completedHops: 3, violations: 0 },
      fuzz: {
        status: 'sampled',
        seedsRequested: [1729],
        gesturesPerSeed: 12,
        completedBySeed: { 1729: 12 },
        violations: 0,
      },
      soak: { status: 'not-run', durationMs: 0 },
      deterministicKanaAndEquivalenceStratum: {
        status: 'verified',
        seed: '静か',
        expected: ['穏やか', 'うるさい'].map((label) => ({ label })),
        observed: Object.fromEntries(
          ['穏やか', 'うるさい'].map((word) => [
            word,
            { exists: true, interactive: true, satellite: true, onScreen: true },
          ]),
        ),
      },
    };
  }
  return { report, context, contract };
}
test('reviewed inventories are independently fixed, including full fast schedule', () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(retainedReportContracts).map(([name, c]) => [name, c.expectedCases().length]),
    ),
    {
      'corridor-build': 9,
      'word-saved-answer': 88,
      'word-saved-answer-controls': 19,
      corridor: 282,
      'corridor-a11y': 62,
      'drift-fast': 66,
    },
  );
  assert.deepEqual(
    driftFastSchedule()
      .filter((row) => row.seed)
      .map((row) => row.gesture),
    [
      'fuzz-pinch-out',
      'fuzz-pinch-in',
      'fuzz-pinch-out',
      'fuzz-pinch-out',
      'fuzz-sat-reveal',
      'fuzz-pan',
      'fuzz-pinch-out',
      'fuzz-sat-reveal',
      'fuzz-pinch-in',
      'fuzz-sat-reveal',
      'fuzz-sat-reveal',
      'fuzz-slow-drag',
    ],
  );
});
for (const name of Object.keys(retainedReportContracts))
  test(`${name}: exact full receipt passes; one-row, omission, duplicate and wrong identity do not`, () => {
    const { report, context, contract } = fixture(name);
    const judged = contract.validate(report, context);
    assert(judged.passed, judged.errors.join(';'));
    const key = name === 'drift-fast' ? 'cases' : 'results';
    for (const mode of ['one', 'missing', 'duplicate', 'renamed', 'red']) {
      const bad = structuredClone(report);
      if (mode === 'one') bad[key] = bad[key].slice(0, 1);
      if (mode === 'missing') bad[key].pop();
      if (mode === 'duplicate') bad[key][1] = structuredClone(bad[key][0]);
      if (mode === 'renamed')
        bad[key][0][name === 'drift-fast' ? 'gesture' : 'name'] = 'undeclared';
      if (mode === 'red')
        bad[key][0][name === 'drift-fast' ? 'outcome' : 'pass'] =
          name === 'drift-fast' ? 'error' : false;
      if (name === 'drift-fast') {
        bad.totals.total = bad[key].length;
        bad.totals.ok = bad[key].length;
      } else bad.summary.total = bad[key].length;
      assert.equal(contract.validate(bad, context).passed, false, mode);
    }
    for (const patch of [{ runId: 'stale' }, { verifierSha256: C }])
      assert.equal(contract.validate(report, { ...context, ...patch }).passed, false);
    if (contract.sourceOnly)
      assert.equal(
        contract.validate(report, { ...context, sourceVerifiedBeforeAndAfter: false }).passed,
        false,
      );
    else
      for (const patch of [
        { artifactSha256: C },
        { artifactVerifiedBeforeAndAfter: false },
        { site: '/wrong/site' },
        { engine: 'webkit' },
      ])
        assert.equal(contract.validate(report, { ...context, ...patch }).passed, false);
    assert.equal(
      contract.validate(report, { ...context, args: [...context.args, '--case', 'one'] }).passed,
      false,
      'filtered invocation',
    );
    for (const malformed of [null, {}, [], { results: [null] }])
      assert.equal(contract.validate(malformed, context).passed, false);
  });
test('Drift self-declared small counts cannot replace three words, three hops or twelve exact seeded actions', () => {
  const { report, context, contract } = fixture('drift-fast');
  for (const mutate of [
    (r) => {
      r.configuration.words = 1;
      r.coverage.matrix.requestedWords = 1;
      r.coverage.matrix.completedWords = 1;
    },
    (r) => {
      r.configuration.fuzzSeeds = [];
      r.coverage.fuzz.seedsRequested = [];
    },
    (r) => {
      r.configuration.scaleNavigation = 'legacy';
    },
    (r) => {
      r.cases.find((row) => row.hop === 2).hop = 1;
    },
    (r) => {
      r.cases.find((row) => row.step === 12).step = 11;
    },
    (r) => {
      r.cases.find((row) => row.zone === 'left-edge').zone = 'right-edge';
    },
    (r) => {
      r.cases.find((row) => row.id === 'theme-camera/夜').theme = '北斎';
    },
    (r) => {
      r.fatalError = 'timeout';
    },
    (r) => {
      r.pageErrors = ['setup failed'];
    },
    (r) => {
      r.runtime.version = null;
    },
    (r) => {
      r.coverage.deterministicKanaAndEquivalenceStratum.observed['うるさい'].interactive = false;
    },
  ]) {
    const bad = structuredClone(report);
    mutate(bad);
    assert.equal(contract.validate(bad, context).passed, false);
  }
});
test('Corridor C1 has exactly one explicit existing branch, never an arbitrary all-pass row', () => {
  const { report, context, contract } = fixture('corridor');
  const row = report.results.find((row) => row.name.startsWith('C1 ·'));
  row.name = 'C1 · a sentence with no shelf article shows no door onto nothing';
  assert.equal(contract.validate(report, context).passed, true);
  report.results.push({ ...row });
  report.summary.total++;
  assert.equal(contract.validate(report, context).passed, false);
});
test('build proof binds assembled Git source and reused artifact separately from the served candidate', () => {
  const { report, context, contract } = fixture('corridor-build');
  for (const mutate of [
    (r) => {
      r.results[0].detail.receipt.gitSha = 'other';
    },
    (r) => {
      r.results[1].detail.artifactSha256 = A;
    },
    (r) => {
      r.results[0].detail.receipt.modules = [];
    },
    (r) => {
      r.runtime.engine = 'webkit';
    },
  ]) {
    const bad = structuredClone(report);
    mutate(bad);
    assert.equal(contract.validate(bad, context).passed, false);
  }
});
