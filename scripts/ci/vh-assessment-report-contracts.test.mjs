/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSESSMENT_CASES,
  assessmentReportContracts,
  validateAssessmentReport,
} from './vh-assessment-report-contracts.mjs';
const sha = 'a'.repeat(64),
  context = {
    engine: 'all',
    artifactSha256: sha,
    verifierSha256: sha,
    runId: 'attempt-1',
    runtimeFiles: Object.fromEntries(
      [
        'corridor.js',
        'reading-controller.mjs',
        'feed-controller.mjs',
        'assessment-question-practice.mjs',
        'assessment-question-view.mjs',
        'corridor.css',
      ].map((path) => [path, sha]),
    ),
  };
function fixture(name) {
  const c = assessmentReportContracts[name],
    producer = c.producer.match(/verify-(.*)\.mjs$/u)[1],
    ids = c.expectedCases(context.engine);
  const rows = ids.map((id) => {
    const at = id.indexOf('/');
    return {
      engine: id.slice(0, at),
      name: id.slice(at + 1),
      pass: true,
      passed: true,
      passes: true,
      browserVersion: '153',
    };
  });
  const r = {
    results: rows,
    checks: rows,
    failures: [],
    failed: 0,
    artifactSha256: sha,
    verifierSha256: sha,
  };
  if (producer === 'assessment-bank')
    Object.assign(r, { schema: 'kairo-assessment-bank-verification/1', passed: true });
  if (producer === 'assessment-v2-controller')
    Object.assign(r, {
      format: 'kairo-assessment-v2-controller-verification',
      controllerSha256: sha,
      coreSha256: sha,
      inputs: [{ path: 'assessment.ts', sha256: sha }],
    });
  if (producer === 'assessment-learning')
    Object.assign(r, { checks: ASSESSMENT_CASES[producer], status: 'passed', count: rows.length });
  if (producer === 'assessment-question-practice')
    Object.assign(r, {
      format: 'kairo-assessment-question-practice-verification',
      sourceSha256: sha,
    });
  if (producer === 'assessment-question-source')
    Object.assign(r, {
      format: 'kairo-assessment-question-source-verification',
      sources: [
        'assessment-question-source.mjs',
        'assessment-question-practice.mjs',
        'assessment-v2-controller.mjs',
        'assessment-learning.mjs',
        'assessment-cloze.mjs',
        'sentence-practice.mjs',
        'teacher-context.mjs',
        'teacher-drafts.mjs',
        'sentence-drafts.mjs',
      ].map((path) => ({ path: `/checkout/prototypes/corridor/${path}`, sha256: sha })),
    });
  if (producer === 'assessment-question-view') {
    r.checks = ids.map((id) => {
      const [browser, width, ...rest] = id.split('/');
      return { browser, width: Number(width), name: rest.join('/'), pass: true };
    });
    Object.assign(r, {
      format: 'kairo-question-view-browser-observation/1',
      caseSelection: 'all',
      runtimeMode: 'immutable-artifact',
      total: rows.length,
      mediaEventsAreNative: true,
      sourcePins: [
        'assessment-question-practice.mjs',
        'assessment-question-view.mjs',
        'corridor.css',
      ].map((path) => ({ path, sha256: sha, provenance: 'selected-immutable-artifact' })),
    });
  }
  if (producer === 'assessment-written-section')
    Object.assign(r, {
      format: 'kairo-public-written-section-walk',
      passed: true,
      formSha256: '56d6ea3b6024cd04447a72c36640ee99c672808d93bcd22f7ccdb4c1e2c198a2',
      sections: [{ level: 'N2' }],
      caseInventory: { planned: rows.map((row) => ({ ...row, selected: true })) },
      assistedWhy: {
        claimable: true,
        skipped: [],
        runs: ['chromium', 'webkit'].map((engine) => ({
          engine,
          passed: true,
          acceptedTerminal: true,
        })),
      },
      assistedWhyExistingCard: {
        claimable: true,
        runs: ['chromium', 'webkit'].map((engine) => ({
          engine,
          passed: true,
          acceptedTerminal: true,
        })),
      },
    });
  if (producer === 'assessment-v2-finalize')
    Object.assign(r, {
      format: 'kairo-assessment-v2-finalization-verification',
      assets: [{ path: 'modules/record-core.mjs', sha256: sha }],
    });
  if (producer === 'assessment-room')
    Object.assign(r, {
      checks: ASSESSMENT_CASES[producer],
      status: 'passed',
      fixture: 'synthetic-not-editorial-approval',
    });
  if (producer === 'assessment-app')
    Object.assign(r, {
      format: 'kairo-assessment-instrumented-app-verification',
      instrumentation: { gradeDiagnostics: false },
      assessmentRetry: {
        harnessSha256: sha,
        caseFilter: null,
        evidence: ['chromium', 'webkit'].flatMap((engine) =>
          ['AR1-retry-exact-item', 'AR2-retry-retained-result'].map((name) => ({
            engine,
            name,
            status: 'passed',
          })),
        ),
      },
    });
  if (producer === 'assessment-standalone')
    Object.assign(r, {
      format: 'kairo-assessment-standalone-verification',
      clickDiagnostics: false,
      originalSha256: sha,
      syntheticSha256: sha,
      results: rows.map((row) => ({ ...row, variant: row.name, blockedExternalRequests: [] })),
    });
  if (producer === 'assessment-private-import')
    Object.assign(r, {
      mode: 'synthetic-pack',
      probes: 3,
      engines: ['chromium', 'webkit'].map((engine) => ({
        engine,
        verdict: 'pass',
        steps: ASSESSMENT_CASES[producer].map((name) => ({
          name,
          detail:
            name === 'backup-export'
              ? {
                  importable: 'ok',
                  omitted: 1,
                  bytes: 300,
                  probes: [1, 2, 3].map(() => ({ backup: 0, liveRecord: 1 })),
                }
              : true,
        })),
      })),
    });
  if (producer === 'assessment-controller')
    Object.assign(r, {
      format: 'kairo-assessment-controller-verification',
      currentInputDifferences: [],
      source: { sha256: sha },
      core: { sha256: sha },
      modules: [{ sha256: sha }],
      stress: {
        attempts: 500,
        itemsPerAttempt: 18,
        totalRetainedResponses: 9000,
        forms: 1,
        serializedBytes: 300,
      },
    });
  if (producer === 'annotation-lookup')
    Object.assign(r, {
      passed: true,
      identity: { artifactSha256: sha },
      sourceSha256: sha,
      fixtureSha256: sha,
      shimSha256: sha,
      browserVersions: { chromium: '153', webkit: '26' },
      controls: [
        'list-form-reenabled-before-reload',
        'list-form-reenabled-before-reload-after-capture',
        'annotation-by-kana-shape',
      ].map((name) => ({ name, fixtureSha256: sha })),
      results: rows.map((row) => ({
        ...row,
        observations: row.name.startsWith('control:')
          ? { rejectedBy: 'Expected read-only predicate' }
          : {},
      })),
    });
  if (['reading-candidates', 'personal-reading', 'source-shelf'].includes(producer)) {
    const engine = name.endsWith('-webkit') ? 'webkit' : 'chromium';
    Object.assign(r, {
      browser: engine,
      corridorSha256: sha,
      controllerSha256: sha,
      pageErrors: [],
    });
    if (producer === 'reading-candidates')
      Object.assign(r, { generated: 20, externalNetworkRequestsSent: 0 });
    else if (producer === 'personal-reading')
      Object.assign(r, {
        browser: { name: engine, version: '153' },
        counterfactualSource: null,
        externalRequestsSent: 0,
      });
    else r.externalRequests = 0;
  }
  if (producer === 'mock')
    Object.assign(r, {
      schemaVersion: 1,
      pass: true,
      artifact: { sha256: sha },
      sources: { verifier: sha, nativeRecordHelper: sha },
    });
  if (producer === 'kagami')
    Object.assign(r, {
      schemaVersion: 2,
      runId: 'attempt-1',
      requestedScope: 'full',
      fullAcceptance: true,
      engines: ['chromium', 'webkit'],
      freshness: {
        pass: true,
        results: ['chromium', 'webkit'].map((engine) => ({
          engine,
          pass: true,
          browserVersion: '153',
        })),
        errors: [],
        externalRequests: [],
      },
    });
  if (producer === 'srs-today') {
    Object.assign(r, {
      format: 'kairo-srs-today-verification',
      status: 'passed',
      seed: { reviews: 300, fresh: 40 },
      summary: { checks: 32, failed: 0, mutants: 2, mutantsCaught: 2 },
      mutants: {},
    });
    for (const [id, target] of Object.entries({
      'uncapped-count': 'cap-50 · the button reads the capped day and equals the session',
      'retention-unwired':
        'gentle · __KAIRO_SRS__.params() reports 85% retention and a step of 10m',
    })) {
      const names =
        id === 'uncapped-count'
          ? [target, 'cap-50 · the home pill reads the same 50', 'no console or page errors']
          : [
              ...ASSESSMENT_CASES[producer]
                .filter((name) => name.startsWith('gentle ·'))
                .slice(0, 5),
              'no console or page errors',
            ];
      r.mutants[id] = {
        caught: true,
        mustFail: target,
        checks: names.map((name) => ({ name, pass: name !== target })),
      };
    }
  }
  return r;
}
function rows(report, name) {
  if (name === 'assessment-private-import') return report.engines[0].steps;
  return [
    'assessment-bank',
    'assessment-v2-controller',
    'assessment-learning',
    'assessment-question-view',
    'assessment-room',
    'srs-today',
  ].includes(name)
    ? report.checks
    : report.results;
}
for (const name of Object.keys(assessmentReportContracts))
  test(`${name}: exact obligations pass and incomplete/forged roster fails`, () => {
    const good = fixture(name);
    assert.deepEqual(validateAssessmentReport(name, good, context).errors, []);
    for (const mutation of [
      (r) => rows(r, name).pop(),
      (r) => {
        const a = rows(r, name);
        a[1] = structuredClone(a[0]);
      },
      (r) => {
        const a = rows(r, name);
        a.length = 0;
      },
      (r) => {
        if (name === 'assessment-private-import') r.engines[0].verdict = 'fail';
        else r.error = 'failure after partial completions';
      },
    ]) {
      const r = structuredClone(good);
      mutation(r);
      assert.equal(validateAssessmentReport(name, r, context).passed, false);
    }
  });
test('self-declared totals, unknown producer and malformed rows never accept', () => {
  assert.equal(validateAssessmentReport('unknown', {}).passed, false);
  for (const name of Object.keys(assessmentReportContracts))
    for (const r of [
      null,
      { passed: 900, failed: 0, results: [] },
      { results: [null], checks: [null], engines: 'wrong' },
    ])
      assert.equal(validateAssessmentReport(name, r, context).passed, false);
});
test('rich semantic evidence and scope survive admission', () => {
  for (const [name, mutate] of [
    [
      'assessment-app',
      (r) => {
        r.assessmentRetry.caseFilter = 'AR1';
      },
    ],
    [
      'assessment-question-view',
      (r) => {
        r.caseSelection = 'offline';
      },
    ],
    [
      'assessment-written-section',
      (r) => {
        r.caseInventory.planned[0].selected = false;
      },
    ],
    [
      'assessment-written-section',
      (r) => {
        r.assistedWhy.runs[0].acceptedTerminal = false;
      },
    ],
    [
      'assessment-private-import',
      (r) => {
        r.engines[0].steps.find((s) => s.name === 'backup-export').detail.probes[0].backup = 1;
      },
    ],
    [
      'annotation-lookup',
      (r) => {
        delete r.results.find((x) => x.name.startsWith('control:')).observations.rejectedBy;
      },
    ],
    [
      'personal-reading',
      (r) => {
        r.counterfactualSource = '/changed.js';
      },
    ],
    [
      'reading-candidates',
      (r) => {
        r.corridorSha256 = 'b'.repeat(64);
      },
    ],
    [
      'source-shelf',
      (r) => {
        r.externalRequests = 1;
      },
    ],
    [
      'kagami',
      (r) => {
        r.freshness.results[1].pass = false;
      },
    ],
    [
      'kagami',
      (r) => {
        r.runId = 'stale';
      },
    ],
    [
      'srs-today',
      (r) => {
        r.mutants['uncapped-count'].checks.find(
          (x) => x.name === r.mutants['uncapped-count'].mustFail,
        ).pass = true;
      },
    ],
    [
      'assessment-controller',
      (r) => {
        r.stress.totalRetainedResponses = 18;
      },
    ],
  ]) {
    const r = fixture(name);
    mutate(r);
    assert.equal(validateAssessmentReport(name, r, context).passed, false, name);
  }
});
