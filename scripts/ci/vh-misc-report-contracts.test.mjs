import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  miscReportContracts,
  MISC_CASES,
  REFERENCE_DATA_PINS,
  SKIP_BROWSER_NAMES,
  SKIP_STANDALONE_CHECKS,
  validateMiscReport,
} from './vh-misc-report-contracts.mjs';
const A = 'a'.repeat(64),
  B = 'b'.repeat(64),
  C = 'c'.repeat(64);
function fixture(name) {
  const engine =
    name === 'redesign-docks' ? 'all' : name.endsWith('webkit') ? 'webkit' : 'chromium';
  const context = {
    engine,
    runId: 'run-id',
    artifactSha256: A,
    verifierSha256: B,
    sourceSha256: C,
    site: '/site',
    artifactVerifiedBeforeAndAfter: true,
    sourceVerifiedBeforeAndAfter: true,
    runtimeFiles: { 'corridor.js': C, 'audio/sentence-cues.json': C },
    sourceHashes: { '/verify-record-binding.mjs': C, '/record-binding.mjs': C },
    args: [],
    env: {},
  };
  const contract = miscReportContracts[name],
    names = contract.expectedCases(engine);
  const report = {
    site: '/site',
    artifactSha256: A,
    verifierSha256: B,
    sourceSha256: C,
    sourceHash: C,
    results: names.map((id) => ({ name: id, pass: true, passed: true, errors: [] })),
    passed: names.length,
    failures: 0,
    failed: 0,
    total: names.length,
    errors: [],
    browserErrors: [],
    browserVersion: '26.6',
    engineVersion: '26.6',
    engine,
    observations: [],
    format: '',
    suite: '',
    status: 'passed',
    completed: true,
    runId: 'run-id',
    fullAcceptance: true,
    missingAssets: [],
  };
  if (['reference-connections', 'reference-browser'].includes(name))
    context.readReport = () => ({
      selectedCase: null,
      excludedChecks: [],
      externalRequests: [],
      site: '/site',
      runId: 'run-id',
      browser: { engine: 'Chromium', version: '26.6' },
    });
  if (name === 'storage-integ')
    Object.assign(report, {
      format: 'kairo-schema-policy-verification',
      version: 2,
      status: 'PASS',
      checks: names.length,
      checkNames: names,
      failures: [],
    });
  if (name === 'record-integrity')
    Object.assign(report, {
      suite: 'record-integrity',
      onlySyntheticData: true,
      externalRequestsSent: 0,
    });
  if (name === 'record-binding')
    Object.assign(report, {
      format: 'kairo-local-record-binding-verification',
      v: 1,
      mode: 'controlled-storage',
      sources: [
        { path: '/verify-record-binding.mjs', sha256: C },
        { path: '/record-binding.mjs', sha256: C },
      ],
    });
  if (name === 'record-sync')
    Object.assign(report, {
      pass: true,
      count: names.length,
      checks: names,
      sourceSha256: C,
      browser: { engine: 'chromium', version: '26.6' },
    });
  if (name === 'tutor-request-binding-integration')
    Object.assign(report, {
      schemaVersion: 1,
      results: names.map((n) => ({
        name: n,
        engine: n.split('-')[0],
        width: Number(n.split('-')[1]),
        passed: true,
        observations: [{}],
        calls: [{ planned: true }],
        errors: [],
        externalRequests: [],
      })),
    });
  if (name === 'skip-standalone')
    Object.assign(report, {
      pass: true,
      mode: 'document',
      browser: '26.6',
      checks: [...SKIP_STANDALONE_CHECKS],
      requests: [],
      shelfLook: { art: 1, artSource: 'blob:' },
    });
  if (name === 'reference-browser') Object.assign(context.runtimeFiles, REFERENCE_DATA_PINS);
  if (name === 'skip-browser') {
    report.checks = [
      ...SKIP_BROWSER_NAMES,
      'review answer 1 comes from retained KANJIDIC2 meanings',
      'review 1 does not invent a spoken reading',
    ].map((name) => ({ name, pass: true }));
    Object.assign(report, {
      browserInfo: { engine: 'Chromium', version: '26.6' },
      deliberateAborts: [],
      consoleErrorDetails: [],
      failedRequests: [],
    });
  }
  if (['storage-integ', 'record-sync', 'skip-browser', 'skip-standalone'].includes(name))
    delete report.results;
  return {
    report: ['reference-connections', 'reference-browser'].includes(name) ? report.results : report,
    context,
  };
}
test('reviewed rosters retain source and browser coverage', () => {
  assert.equal(MISC_CASES.connections.length, 20);
  assert.equal(MISC_CASES.integrity.length, 25);
  assert.equal(MISC_CASES.binding.length, 14);
  assert.equal(MISC_CASES.storage.length, 26);
  assert.equal(MISC_CASES.sync.length, 23);
  assert.equal(MISC_CASES.writing.length, 51);
});
for (const name of Object.keys(miscReportContracts))
  test(`${name}: valid complete fixture; missing proof and identity fail`, () => {
    const { report, context } = fixture(name),
      judged = validateMiscReport(name, report, context);
    assert(judged.passed, judged.errors.join(';'));
    for (const bad of [null, undefined, {}, [], { results: [null] }])
      assert.equal(validateMiscReport(name, bad, context).passed, false, name);
    const unbound = {
      ...context,
      artifactSha256: null,
      artifactVerifiedBeforeAndAfter: false,
      sourceVerifiedBeforeAndAfter: false,
    };
    assert.equal(validateMiscReport(name, report, unbound).passed, false, name);
    for (const key of ['results', 'checks', 'checkNames', 'tours', 'decks'])
      if (Array.isArray(report[key]) && report[key].length) {
        const shortened = structuredClone(report);
        shortened[key].pop();
        assert.equal(
          validateMiscReport(name, shortened, context).passed,
          false,
          `${name}/${key} omitted`,
        );
      }
    if (Array.isArray(report)) {
      assert.equal(validateMiscReport(name, report.slice(1), context).passed, false);
    }
  });
test('controlled storage mode and planned provider completion are mandatory', () => {
  const binding = fixture('record-binding');
  binding.report.mode = 'browser';
  assert.equal(validateMiscReport('record-binding', binding.report, binding.context).passed, false);
  const tutor = fixture('tutor-request-binding-integration');
  tutor.report.results[0].calls[0].planned = false;
  assert.equal(
    validateMiscReport('tutor-request-binding-integration', tutor.report, tutor.context).passed,
    false,
  );
});
test('attempt, site, source and engine identity are bound wherever the producer writes them', () => {
  const rejects = (name, mutate, label) => {
    const { report, context } = fixture(name);
    mutate(report, context);
    assert.equal(validateMiscReport(name, report, context).passed, false, `${name}: ${label}`);
  };
  for (const name of ['reference-connections', 'reference-browser']) {
    for (const [label, change] of [
      ['stale execution nonce', { runId: 'previous-run' }],
      ['absent execution nonce', { runId: undefined }],
      ['self-assembled site', { site: '/tmp/runtime-1234/site' }],
      ['absent site', { site: undefined }],
    ])
      rejects(
        name,
        (r, c) => {
          const read = c.readReport;
          c.readReport = (path) => ({ ...read(path), ...change });
        },
        label,
      );
    rejects(name, (r, c) => delete c.runId, 'unbound attempt');
  }
  for (const [label, mutate] of [
    ['stale nonce', (r) => (r.runId = 'previous-run')],
    ['other source bytes', (r) => (r.sourceSha256 = 'd'.repeat(64))],
    ['unbound source', (r, c) => delete c.sourceSha256],
    ['absent browser build', (r) => delete r.browser.version],
    ['wrong engine', (r) => (r.browser.engine = 'webkit')],
  ])
    rejects('record-sync', mutate, label);
  for (const [label, mutate] of [
    ['missing named check', (r) => r.checks.splice(3, 1)],
    ['duplicate named check', (r) => (r.checks[0] = r.checks[1])],
    ['unreviewed check', (r) => r.checks.push('invented')],
    ['one-boolean legacy receipt', (r) => delete r.checks],
    ['stale nonce', (r) => (r.runId = 'previous-run')],
    ['other site', (r) => (r.site = '/elsewhere')],
  ])
    rejects('skip-standalone', mutate, label);
  const { report, context } = fixture('skip-standalone');
  const judged = validateMiscReport('skip-standalone', report, context);
  assert.deepEqual(
    judged.observedCases,
    SKIP_STANDALONE_CHECKS.map((name) => `chromium/${name}`),
  );
  report.checks.pop();
  assert.equal(validateMiscReport('skip-standalone', report, context).observedCases.length, 10);
});

test('reference registry binds actual bundled data and rejects the pre-E3 sidecar pin', () => {
  const { report, context } = fixture('reference-browser');
  for (const [path, expected] of Object.entries(REFERENCE_DATA_PINS)) {
    const bytes = readFileSync(new URL(`../../prototypes/corridor/${path}`, import.meta.url));
    const actual = createHash('sha256').update(bytes).digest('hex');
    assert.equal(actual, expected, path);
    context.runtimeFiles[path] = actual;
  }
  assert.equal(validateMiscReport('reference-browser', report, context).passed, true);
  for (const oldPin of [
    'd3ad5ee711abb3122d263c4e0d8772dc6f8ce2cb671a9865ac5d03e512138e3d',
    '9c81f60aa68d788ad97714dfc0413c5649898b479e55a5686d60c33b610be0e4',
  ]) {
    context.runtimeFiles['data/share_alike/reference-extra.json'] = oldPin;
    const rejected = validateMiscReport('reference-browser', report, context);
    assert.equal(rejected.passed, false);
    assert(
      rejected.errors.includes(
        'Reference data roster changed: data/share_alike/reference-extra.json',
      ),
    );
  }
});
