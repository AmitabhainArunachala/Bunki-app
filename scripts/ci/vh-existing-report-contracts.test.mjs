/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import {
  existingReportContracts,
  validateExistingReport,
  EXISTING_CASES,
  CONTRAST_WORLDS,
  CONTRAST_STATES,
  contrastExpectedCases,
} from './vh-existing-report-contracts.mjs';
const A = 'a'.repeat(64),
  B = 'b'.repeat(64);
function fixture(gate) {
  const contract = existingReportContracts[gate],
    engine = gate.endsWith('webkit') ? 'webkit' : 'chromium';
  const results = contract.expectedCases(engine).map((id) => {
    const pieces = id.split('/'),
      e = pieces.shift();
    const width = /^\d+$/u.test(pieces[0]) ? Number(pieces.shift()) : undefined,
      name = pieces.join('/');
    return {
      name,
      engine: e,
      ...(width ? { width } : {}),
      ...(name.endsWith('-control') ? { control: name } : {}),
      pass: true,
      passed: true,
      status: 'passed',
      errors: [],
      pageErrors: [],
      externalRequests: [],
      audioRequests: [],
      observations: [{ name: 'completed journey' }],
      browserVersion: '1.0',
      browser: '1.0',
      ordinaryUi: true,
      syntheticFaultsInjected: false,
      allContextsClosed: true,
      transport: { blocked: [], externalRequestsSent: 0 },
      receipt: `${name}/receipt.json`,
    };
  });
  const report = {
    artifactSha256: A,
    verifierSha256: B,
    pass: true,
    mode: gate.startsWith('record-binding') ? 'browser' : 'full',
    engines: [engine],
    engine,
    browserVersion: '1.0',
    browserVersions: { [engine]: '1.0' },
    results,
    errors: [],
    externalRequests: [],
    failed: 0,
    failures: 0,
    sourceDigestContract: 'token-boundary-array',
    externalRequestsSent: 0,
    artifactAndVerifierUnchangedDuringRun: true,
    artifactVerifierAndHelpersUnchangedDuringRun: true,
    verifierUnchangedDuringRun: true,
    allContextsClosed: true,
    stoppedAfterFirstFailure: false,
    verificationMode: 'explicit-immutable-artifact',
    controllerSha256: A,
    coreSha256: A,
    format: 'kairo-local-record-binding-verification',
    observations: {
      runtime: { engine, version: '1.0' },
      artifact: {
        sha256: A,
        verifiedEntries: [
          { path: 'record-binding.mjs', sha256: A },
          { path: 'modules/record-core.mjs', sha256: A },
        ],
      },
    },
  };
  report.suite = {
    'teacher-context-integration': 'teacher-context-integration',
    'teacher-drafts-integration': 'teacher-drafts',
    'sentence-drafts-integration': 'sentence-drafts',
    'source-kanji-practice-integration': 'source-kanji-practice',
    'reading-position-integration': 'record-reading-position',
  }[gate];
  const context = {
    engine,
    artifactSha256: A,
    verifierSha256: B,
    runtimeFiles: {
      'record-controller.mjs': A,
      'modules/record-core.mjs': A,
      'record-binding.mjs': A,
    },
    readReport: (path) => results.find((row) => row.receipt === path),
  };
  return { report, context };
}
test('reviewed independent rosters retain all dynamic scenarios and Chromium-only crash cases', () => {
  assert.equal(EXISTING_CASES['record-controller'].length, 55);
  assert.equal(EXISTING_CASES['record-controller-chromium-extra'].length, 9);
  assert.equal(EXISTING_CASES['record-host'].length, 30);
  assert.equal(EXISTING_CASES['record-app'].length, 32);
  assert.equal(EXISTING_CASES['teacher-drafts'].length, 14);
});
for (const gate of Object.keys(existingReportContracts).filter(
  (name) => !name.startsWith('contrast-sweep'),
)) {
  test(`${gate}: valid full fixture; empty, duplicate/missing, wrong engine and semantic red fail`, () => {
    const { report, context } = fixture(gate);
    let judged = validateExistingReport(gate, report, context);
    assert(judged.passed, judged.errors.join(';'));
    const empty = structuredClone(report);
    empty.results = [];
    assert.equal(validateExistingReport(gate, empty, context).passed, false);
    const duplicate = structuredClone(report);
    if (duplicate.results.length === 1) duplicate.results.push(duplicate.results[0]);
    else duplicate.results[duplicate.results.length - 1] = duplicate.results[0];
    assert.equal(validateExistingReport(gate, duplicate, context).passed, false);
    const red = structuredClone(report);
    red.results[0].pass = false;
    red.results[0].passed = false;
    red.results[0].status = 'failed';
    assert.equal(validateExistingReport(gate, red, context).passed, false);
    const engine = structuredClone(report);
    engine.engine = 'other';
    engine.engines = ['other'];
    engine.results[0].engine = 'other';
    if (engine.observations) engine.observations.runtime.engine = 'other';
    assert.equal(validateExistingReport(gate, engine, context).passed, false);
    const claimed = structuredClone(report);
    claimed.results.pop();
    claimed.expectedCases = claimed.results.length;
    claimed.passed = claimed.results.length;
    assert.equal(
      validateExistingReport(gate, claimed, context).passed,
      false,
      'self-reported expected count does not replace reviewed roster',
    );
  });
}
function contrastFixture(engine) {
  const expected = contrastExpectedCases(engine);
  const pair = {
    text: 'Kanji',
    sel: '#mini .mini-band-label',
    demo: true,
    demoBandLabel: true,
    fontPx: 14,
    weight: 400,
    ratio: 7,
    required: 4.5,
    opacity: 1,
    ok: true,
  };
  const wordPair = { ...pair, text: '年', sel: '#mini .mini-word', demoBandLabel: false };
  const candidate = { pairs: [pair, wordPair], unresolved: [] };
  const report = {
    schemaVersion: 2,
    runId: 'contrast-attempt',
    artifactSha256: A,
    verifierSha256: B,
    fullAcceptance: true,
    selectedPassed: true,
    partial: false,
    requestedScope: 'full',
    selectors: { worlds: null, states: null, demoOnly: false },
    freshDemoMotion: 'no-preference',
    settledMotion: 'reduce',
    engines: { [engine]: '1.0' },
    worlds: [...CONTRAST_WORLDS],
    states: [...CONTRAST_STATES, 'fresh-demo'],
    expectedCases: expected,
    observedCases: expected,
    source: [{ ok: true }],
    rows: expected.map((id) => ({
      id,
      ok: true,
      ...(id.endsWith('/fresh-demo.reach') ? { observed: '年' } : {}),
      ...(id.endsWith('/fresh-demo.arrival')
        ? {
            observed: [
              {
                current: true,
                name: 'read-mini-rise',
                animationType: 'CSSAnimation',
                documentId: '4b60dc24-b05a-4546-8341-9b76d7368f06',
                sameDocument: true,
                motionPreference: 'no-preference',
                completed: true,
                timeOrigin: 1000,
                frameCalibration: {
                  method: 'median-of-12-pre-arrival-raf-intervals',
                  timeOrigin: 1000,
                  documentId: '4b60dc24-b05a-4546-8341-9b76d7368f06',
                  sameDocument: true,
                  timestamps: Array.from({ length: 13 }, (_, index) => index * 16),
                  frameMs: 16,
                },
                startTime: 500,
                observedAt: 860,
                rafTime: 860,
                currentTime: 350,
                playbackRate: 1,
                authoredDuration: 350,
                authoredDelay: 0,
                authoredEndDelay: 0,
                authoredIterations: 1,
                authoredEnd: 350,
                opacity: 1,
                elapsed: 360,
                frameMs: 16,
                playState: 'finished',
              },
            ],
          }
        : {}),
    })),
    results: CONTRAST_WORLDS.flatMap((world) =>
      [...CONTRAST_STATES, 'fresh-demo.settled'].map((state) => ({
        engine,
        world,
        state,
        ...structuredClone(candidate),
      })),
    ),
    controls: [
      {
        engine,
        id: 'same-ink-background',
        candidate,
        restored: structuredClone(candidate),
        mutant: { pairs: [{ ...pair, ok: false, ratio: 1 }, wordPair], unresolved: [] },
        styleBefore: null,
        styleAfter: null,
        recordBefore: { unknownExtension: ['preserved'] },
        recordAfter: { unknownExtension: ['preserved'] },
      },
    ],
  };
  report.controls[0].candidate = structuredClone(
    report.results.find(
      (scene) => scene.world === 'hokusai' && scene.state === 'fresh-demo.settled',
    ),
  );
  return {
    report,
    context: { engine, runId: 'contrast-attempt', artifactSha256: A, verifierSha256: B },
  };
}
for (const engine of ['chromium', 'webkit'])
  test(`contrast-sweep ${engine}: exact full roster, settled contrast, authored arrival and a real killed/restored control`, () => {
    const gate = `contrast-sweep${engine === 'webkit' ? '-webkit' : ''}`;
    const { report, context } = contrastFixture(engine);
    const validate = (value) => validateExistingReport(gate, value, context);
    assert.equal(contrastExpectedCases(engine).length, 857);
    assert(validate(report).passed, validate(report).errors.join(';'));
    const mutations = [
      (r) => {
        r.rows.pop();
      },
      (r) => {
        r.rows[0] = r.rows[1];
      },
      (r) => {
        r.rows.push({ id: 'invented', ok: true });
      },
      (r) => {
        r.rows[0].ok = false;
      },
      (r) => {
        r.expectedCases = r.expectedCases.slice(1);
        r.rows.shift();
        r.observedCases = r.expectedCases;
      },
      (r) => {
        r.selectors.demoOnly = true;
      },
      (r) => {
        r.selectors.worlds = [...CONTRAST_WORLDS];
      },
      (r) => {
        r.fullAcceptance = false;
      },
      (r) => {
        r.freshDemoMotion = 'reduce';
      },
      (r) => {
        r.rows.find((row) => row.id.endsWith('/fresh-demo.arrival')).observed[0].motionPreference =
          'reduce';
      },
      (r) => {
        r.controls[0].candidate.world = 'sumi';
      },
      (r) => {
        r.engines = { other: '1.0' };
      },
      (r) => {
        r.runId = 'replay';
      },
      (r) => {
        r.results.pop();
      },
      (r) => {
        r.results.find((scene) => scene.state === 'fresh-demo.settled').pairs = [];
      },
      (r) => {
        r.results.find((scene) => scene.state === 'fresh-demo.settled').pairs[0].ratio = 3;
      },
      (r) => {
        r.results.find((scene) => scene.state === 'fresh-demo.settled').pairs[0].required = 3;
      },
      (r) => {
        r.rows.find((row) => row.id.endsWith('/fresh-demo.arrival')).observed[0].opacity = 0.9;
      },
      (r) => {
        r.rows.find((row) => row.id.endsWith('/fresh-demo.arrival')).observed[0].elapsed = 367;
      },
      (r) => {
        r.rows.find((row) => row.id.endsWith('/fresh-demo.arrival')).observed[0].startTime = 700;
      },
      (r) => {
        r.rows.find((row) => row.id.endsWith('/fresh-demo.arrival')).observed[0].name = 'feel-fade';
      },
      (r) => {
        r.rows.find((row) => row.id.endsWith('/fresh-demo.arrival')).observed[0].missingAnimation =
          true;
      },
      (r) => {
        const a = r.rows.find((row) => row.id.endsWith('/fresh-demo.arrival')).observed[0];
        a.noAnimation = true;
        a.authoredDuration = 0;
        a.authoredEnd = 0;
      },
      (r) => {
        const a = r.rows.find((row) => row.id.endsWith('/fresh-demo.arrival')).observed[0];
        a.observedAt = 1000;
        a.rafTime = 1000;
        a.elapsed = 500;
        a.frameMs = 500;
      },
      (r) => {
        r.rows.find((row) => row.id.endsWith('/fresh-demo.arrival')).observed[0].playState =
          'paused';
      },
      (r) => {
        r.rows.find((row) =>
          row.id.endsWith('/fresh-demo.arrival'),
        ).observed[0].frameCalibration.timestamps[12] = 800;
      },
      (r) => {
        r.rows.find((row) => row.id.endsWith('/fresh-demo.arrival')).observed[0].documentId =
          '4b60dc24-b05a-4546-8341-9b76d7368f07';
      },
      (r) => {
        r.rows.find((row) => row.id.endsWith('/fresh-demo.arrival')).observed[0].sameDocument =
          false;
      },
      (r) => {
        r.rows.find((row) =>
          row.id.endsWith('/fresh-demo.arrival'),
        ).observed[0].frameCalibration.sameDocument = false;
      },
      (r) => {
        r.controls = [];
      },
      (r) => {
        r.controls[0].mutant = r.controls[0].candidate;
      },
      (r) => {
        r.controls[0].styleAfter = '';
      },
      (r) => {
        r.controls[0].recordAfter.unknownExtension = [];
      },
      (r) => {
        r.controls[0].restored.pairs[0].ratio = 6;
      },
    ];
    mutations.forEach((mutate, index) => {
      const altered = structuredClone(report);
      mutate(altered);
      assert.equal(validate(altered).passed, false, `negative ${index} accepted`);
    });
  });
test('contrast CLI rejects unknown, empty and duplicate narrowing before artifact resolution or browser launch', () => {
  const file = fileURLToPath(
    new URL('../../prototypes/corridor/tools/verify-contrast-sweep.mjs', import.meta.url),
  );
  for (const [args, selectors, message] of [
    [['--unknown'], {}, 'Unknown contrast-sweep argument'],
    [['--demo-only', '--demo-only'], {}, 'Unknown contrast-sweep argument'],
    [[], { SWEEP_WORLDS: '' }, 'Unknown/empty SWEEP_WORLDS'],
    [[], { SWEEP_WORLDS: 'imagined' }, 'Unknown/empty SWEEP_WORLDS'],
    [[], { SWEEP_WORLDS: 'hokusai,hokusai' }, 'Duplicate SWEEP_WORLDS'],
    [[], { SWEEP_STATES: '' }, 'Unknown/empty SWEEP_STATES'],
    [[], { SWEEP_STATES: 'invented' }, 'Unknown/empty SWEEP_STATES'],
    [[], { SWEEP_STATES: 'reader,reader' }, 'Duplicate SWEEP_STATES'],
  ]) {
    const env = { ...process.env, KAIRO_BROWSER: 'chromium' };
    delete env.KAIRO_SITE_DIR;
    delete env.KAIRO_ARTIFACT_SHA256;
    delete env.SWEEP_WORLDS;
    delete env.SWEEP_STATES;
    const result = spawnSync(process.execPath, [file, ...args], {
      env: { ...env, ...selectors },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 1);
    assert(result.stderr.includes(message), result.stderr);
    assert(
      !result.stderr.includes('Pin an immutable built site'),
      'selector was validated after artifact resolution',
    );
  }
});
test('identity and richer child/provider/integrity semantics are retained', () => {
  for (const gate of [
    'teacher-context-integration',
    'sentence-drafts-integration',
    'record-host',
    'record-binding-browser',
  ]) {
    const { report, context } = fixture(gate);
    context.artifactSha256 = 'c'.repeat(64);
    assert.equal(validateExistingReport(gate, report, context).passed, false);
  }
  const teacher = fixture('teacher-context-integration');
  teacher.context.readReport = () => ({ status: 'passed' });
  assert.equal(
    validateExistingReport('teacher-context-integration', teacher.report, teacher.context).passed,
    false,
  );
  const drafts = fixture('teacher-drafts-integration');
  drafts.report.results[0].transport.blocked = ['external'];
  assert.equal(
    validateExistingReport('teacher-drafts-integration', drafts.report, drafts.context).passed,
    false,
  );
  const partial = fixture('sentence-drafts-integration');
  partial.report.mode = 'filtered';
  assert.equal(
    validateExistingReport('sentence-drafts-integration', partial.report, partial.context).passed,
    false,
  );
  const source = fixture('source-learning-integration');
  source.report.expectedSourceLoss = true;
  assert.equal(
    validateExistingReport('source-learning-integration', source.report, source.context).passed,
    false,
  );
  assert.equal(validateExistingReport('unmigrated-producer', {}).passed, false);
});
test('actual engine and browser-version evidence is mandatory, never checked only when a producer happens to emit it', () => {
  const rejects = (gate, mutate, label) => {
    const { report, context } = fixture(gate);
    mutate(report, context);
    assert.equal(validateExistingReport(gate, report, context).passed, false, `${gate}: ${label}`);
  };
  for (const gate of [
    'source-inbox-integration',
    'listening-intake-integration',
    'timed-transcript-integration',
    'source-learning-integration',
    'sentence-practice-integration',
    'sentence-feedback-integration',
    'bundled-practice-integration',
    'bundled-listening-integration',
    'bundled-listening-failures',
    'later-encounters-integration',
    'source-processing-integration',
    'sentence-drafts-integration',
    'source-kanji-practice-integration',
  ]) {
    rejects(gate, (r) => delete r.results.at(-1).browserVersion, 'row version absent');
    rejects(gate, (r) => (r.results[0].browserVersion = null), 'row version null');
  }
  for (const gate of ['teacher-drafts-integration', 'reading-position-integration']) {
    rejects(gate, (r) => delete r.engines, 'declared engines absent');
    rejects(gate, (r) => delete r.browserVersions, 'report versions absent');
    rejects(gate, (r) => (r.browserVersions = {}), 'engine version absent');
  }
  rejects('sentence-drafts-integration', (r) => delete r.engines, 'declared engines absent');
  rejects('record-host-webkit', (r) => delete r.browserVersion, 'single-engine version absent');
  rejects('record-binding-webkit', (r) => delete r.observations.runtime.version, 'runtime version');
  rejects(
    'teacher-context-integration',
    (r, c) => {
      const read = c.readReport;
      c.readReport = (path) => ({ ...read(path), browser: undefined });
    },
    'child browser build absent',
  );
  for (const gate of Object.keys(existingReportContracts).filter(
    (name) => !['record-controller', 'record-controller-webkit'].includes(name),
  )) {
    rejects(gate, (r, c) => delete c.artifactSha256, 'artifact unbound');
    if (!gate.startsWith('record-binding'))
      rejects(gate, (r, c) => delete c.verifierSha256, 'verifier unbound');
  }
  for (const engine of ['chromium', 'webkit']) {
    const gate = `contrast-sweep${engine === 'webkit' ? '-webkit' : ''}`;
    for (const key of ['runId', 'artifactSha256', 'verifierSha256', 'engine']) {
      const { report, context } = contrastFixture(engine);
      delete context[key];
      assert.equal(validateExistingReport(gate, report, context).passed, false, `${gate}: ${key}`);
    }
  }
});
