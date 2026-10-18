/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  voiceReportContracts,
  validateVoiceReport,
  SENSE_CONTROL_IDS,
  VOICE_CONTROL_IDS,
} from './vh-voice-report-contracts.mjs';
import {
  SENSE_DATA_INVENTORY,
  SPEAK_CHECK_NAMES,
  SPEAK_MUTANT_SPEC,
  SPEAK_CONTROL_ROSTER_BY_ENGINE,
} from './vh-voice-rosters.mjs';
const A = 'a'.repeat(64),
  B = 'b'.repeat(64),
  C = 'c'.repeat(64);
function base(name, engine = 'chromium') {
  const context = {
    engine,
    runId: 'current-invocation',
    artifactSha256: A,
    verifierSha256: B,
    sourceSha256: C,
    sourceVerifiedBeforeAndAfter: true,
    runtimeFiles: Object.fromEntries([...SENSE_DATA_INVENTORY, ['corridor.js', C]]),
  };
  return {
    context,
    report: {
      schemaVersion: 1,
      runId: context.runId,
      artifactSha256: A,
      verifierSha256: B,
      sourceSha256: C,
      fullAcceptance: true,
      selectedPassed: true,
      expectedCases: voiceReportContracts[name].expectedCases(context.engine),
      observedCases: voiceReportContracts[name].expectedCases(context.engine),
    },
  };
}
function speak(engine = 'chromium') {
  const { report, context } = base('speak', engine);
  report.engines = { [engine]: '26.6' };
  report.only = null;
  report.phase = 'candidate';
  report.complete = true;
  report.pageErrors = [];
  report.cases = [];
  report.checks = [];
  for (const [caseId, names] of Object.entries(SPEAK_CHECK_NAMES)) {
    const applicable = names.filter((name) =>
      engine === 'webkit'
        ? !name.startsWith('Chromium frames')
        : !name.startsWith("WebKit's worst frame"),
    );
    report.cases.push({
      engine,
      case: caseId,
      completed: true,
      pass: true,
      checks: applicable.length,
    });
    report.checks.push(...applicable.map((name) => ({ engine, case: caseId, name, pass: true })));
  }
  return { report, context };
}
function sense() {
  const { report, context } = base('sense-truth');
  Object.assign(report, {
    engines: ['chromium'],
    versions: { chromium: '26.6' },
    complete: true,
    partial: false,
    vhControl: null,
    vhSelected: null,
    failed: 0,
    requestedScope: ['f0', 'g', 'w', 'c'],
    attempts: [],
    rows: report.expectedCases.map((id) => {
      const i = id.indexOf('/');
      return { engine: id.slice(0, i), id: id.slice(i + 1), ok: true };
    }),
  });
  report.attempts = report.expectedCases
    .filter((id) => /\/G\./u.test(id) && !id.endsWith('.classification'))
    .map((id) => {
      const split = id.indexOf('/');
      return {
        engine: id.slice(0, split),
        fixture: id.slice(split + 3),
        history: [{ complete: true, observations: 1 }],
      };
    });
  return { report, context };
}
test('independent Sense registry includes 135 data and 1462 browser rows; Speak actual per-engine assertion coverage', () => {
  assert.equal(voiceReportContracts['sense-truth'].expectedCases('chromium').length, 1597);
  assert.equal(voiceReportContracts['sense-truth'].expectedCases('all').length, 3059);
  const { report, context } = speak();
  const judged = validateVoiceReport('speak', report, context);
  assert(judged.passed, judged.errors.join(';'));
  assert.equal(report.checks.length, 120);
});
for (const [name, fixture] of [
  ['sense-truth', sense],
  ['speak', speak],
])
  test(`${name}: complete proof passes; empty/self-certified subset/wrong identity/semantic red cannot`, () => {
    const { report, context } = fixture();
    let judged = validateVoiceReport(name, report, context);
    assert(judged.passed, judged.errors.join(';'));
    for (const key of ['runId', 'artifactSha256', 'verifierSha256'])
      assert.equal(validateVoiceReport(name, { ...report, [key]: 'other' }, context).passed, false);
    assert.equal(validateVoiceReport(name, report, { ...context, engine: 'all' }).passed, false);
    assert.equal(
      validateVoiceReport(name, report, { ...context, env: { SPEAK_CASES: 'S1' } }).passed,
      false,
    );
    const mutant = structuredClone(report),
      key = name === 'speak' ? 'cases' : 'rows';
    mutant[key].pop();
    mutant.expectedCases.pop();
    mutant.observedCases.pop();
    assert.equal(
      validateVoiceReport(name, mutant, context).passed,
      false,
      'self-declared coverage cannot shrink registry',
    );
    const red = structuredClone(report);
    if (name === 'speak') red.checks[0].pass = false;
    else red.rows[0].ok = false;
    assert.equal(validateVoiceReport(name, red, context).passed, false);
  });
test('Speak removed assertion cannot pass by decrementing its self-reported check count', () => {
  const { report, context } = speak();
  report.checks.shift();
  report.cases[0].checks--;
  assert.equal(validateVoiceReport('speak', report, context).passed, false);
});
test('both Speak engines require their own timing row, never the other engine’s alternative', () => {
  for (const engine of ['chromium', 'webkit']) {
    const { report, context } = speak(engine);
    const judged = validateVoiceReport('speak', report, context);
    assert(judged.passed, judged.errors.join(';'));
    assert.equal(report.checks.length, 120);
    const prefix = engine === 'webkit' ? "WebKit's worst frame" : 'Chromium frames';
    const index = report.checks.findIndex((row) => row.name.startsWith(prefix));
    assert(index >= 0);
    report.checks.splice(index, 1);
    report.cases.find((row) => row.case === 'S15').checks--;
    assert.equal(
      validateVoiceReport('speak', report, context).passed,
      false,
      'timing assertion cannot be omitted',
    );
  }
});
test('Sense source changes require independent roster review, and semantic retry never launders a red', () => {
  const { report, context } = sense();
  context.runtimeFiles['data/articles/index.json'] = A;
  assert.equal(validateVoiceReport('sense-truth', report, context).passed, false);
  const clean = sense();
  clean.report.attempts = [
    { history: [{ stage: 'semantic', observations: 1, retry: true }, { complete: true }] },
  ];
  assert.equal(validateVoiceReport('sense-truth', clean.report, clean.context).passed, false);
});
test('copy controls require all six exact controls and unique nonce-bound completed mutant/restored sources', () => {
  const { report, context } = base('vh-voice-controls');
  report.rows = VOICE_CONTROL_IDS.map((control) => ({
    control,
    status: 'caught',
    restored: true,
    matches: 1,
    sourceSha256: C,
    mutationSha256: A,
    phases: ['baseline', 'mutant', 'restore'].map((phase) => {
      const nonce = `${control}-${phase}`;
      return {
        phase,
        nonce,
        input: `/${phase}-${nonce}.js`,
        tap: `/${phase}-${nonce}.tap`,
        tapSha256: B,
        completed: true,
        ok: true,
        error: null,
        signal: null,
        exit: phase === 'mutant' ? 1 : 0,
        digest: phase === 'mutant' ? A : C,
        intended: phase === 'mutant',
      };
    }),
  }));
  const judged = validateVoiceReport('vh-voice-controls', report, context);
  assert(judged.passed, judged.errors.join(';'));
  for (const change of [
    { completed: false },
    { intended: false },
    { exit: 0 },
    { signal: 'SIGTERM' },
    { nonce: '' },
  ]) {
    const mutant = structuredClone(report);
    Object.assign(mutant.rows[0].phases[1], change);
    assert.equal(validateVoiceReport('vh-voice-controls', mutant, context).passed, false);
  }
  const shortened = structuredClone(report);
  shortened.rows.pop();
  shortened.expectedCases.pop();
  shortened.observedCases.pop();
  assert.equal(validateVoiceReport('vh-voice-controls', shortened, context).passed, false);
});
test('Sense controls reread fresh child receipts; caught labels with missing nonce/semantic rows do not suffice', () => {
  const { report, context } = base('vh-sense-controls');
  report.selected = null;
  report.engines = ['chromium'];
  report.sourceDigest = C;
  report.rows = SENSE_CONTROL_IDS.map((control) => ({
    engine: 'chromium',
    control,
    status: 'caught',
    restored: true,
    phases: ['baseline', 'mutant', 'restore'].map((phase) => ({
      phase,
      dir: `/${phase}-nonce-${control}`,
      exit: phase === 'mutant' ? 1 : 3,
      ok: true,
      fresh: true,
    })),
  }));
  context.readReport = () => ({
    schemaVersion: 1,
    runId: context.runId,
    nonce: 'stale',
    artifactSha256: A,
    verifierSha256: B,
    fullAcceptance: false,
    engines: ['chromium'],
    attempts: [{ history: [{ complete: true }] }],
    rows: [],
    complete: true,
    selectedPassed: true,
    vhMutations: [],
  });
  assert.equal(validateVoiceReport('vh-sense-controls', report, context).passed, false);
});
test('all adapters reject malformed or missing receipts without throwing', () => {
  for (const name of Object.keys(voiceReportContracts))
    for (const report of [undefined, null, {}, [], { rows: [null] }, { checks: {}, cases: [] }])
      assert.equal(validateVoiceReport(name, report, {}).passed, false, name);
});
function speakNegatives(engine) {
  const { report, context } = base('speak-negatives', engine),
    children = new Map();
  const applicable = SPEAK_CONTROL_ROSTER_BY_ENGINE[engine];
  report.engines = [engine];
  report.selected = null;
  report.requestedScope = [...applicable];
  report.applicability = { [engine]: [...applicable] };
  for (const file of ['corridor.js', 'speak.js', 'speak-core.mjs']) context.runtimeFiles[file] = C;
  report.rows = applicable.map((fault) => {
    const spec = SPEAK_MUTANT_SPEC[fault];
    const row = {
      engine,
      fault,
      status: 'caught',
      restored: true,
      anchor: { matches: 1, file: spec.file, before: C, after: A },
    };
    for (const phase of ['baseline', 'mutant', 'restore']) {
      const nonce = `${fault}-${phase}`,
        evidence = `/${nonce}`,
        cases = Object.keys(spec.witness);
      const checks = cases.flatMap((id) =>
        SPEAK_CHECK_NAMES[id].map((name) => ({
          engine,
          case: id,
          name,
          pass: phase !== 'mutant' || !new RegExp(spec.witness[id], 'u').test(name),
        })),
      );
      const child = {
        nonce,
        runId: context.runId,
        phase,
        artifactSha256: A,
        verifierSha256: B,
        fullAcceptance: false,
        complete: true,
        engines: { [engine]: '26.6' },
        pageErrors: [],
        only: cases,
        fault: phase === 'mutant' ? fault : null,
        selectedPassed: phase !== 'mutant',
        cases: cases.map((id) => ({
          engine,
          case: id,
          completed: true,
          checks: checks.filter((r) => r.case === id).length,
        })),
        checks,
        mutations: { [fault]: { matches: 1, before: C, after: A, served: 1 } },
      };
      children.set(`${evidence}/verify-speak.json`, child);
      row[phase] = {
        phase,
        nonce,
        evidence,
        exit: phase === 'mutant' ? 1 : 3,
        ok: true,
        identityOkay: true,
        served: { 'speak.js': [C] },
      };
    }
    return row;
  });
  context.readReport = (p) => children.get(p);
  return { report, context, children };
}
test('Speak mutant admission rereads all phase nonces and exact primary assertions; unrelated red or setup failure cannot kill', () => {
  const { report, context, children } = speakNegatives('chromium');
  const judged = validateVoiceReport('speak-negatives', report, context);
  assert(judged.passed, judged.errors.join(';'));
  const first = children.get(`${report.rows[0].mutant.evidence}/verify-speak.json`);
  const nonce = first.nonce;
  first.nonce = 'stale';
  assert.equal(validateVoiceReport('speak-negatives', report, context).passed, false);
  first.nonce = nonce;
  const green = first.checks.find((r) => r.pass);
  green.pass = false;
  assert.equal(
    validateVoiceReport('speak-negatives', report, context).passed,
    false,
    'unrelated red invalidates intended kill',
  );
  green.pass = true;
  report.rows[0].mutant.timedOut = true;
  assert.equal(validateVoiceReport('speak-negatives', report, context).passed, false);
});
test('independent admission requires all 22 WebKit or 21 Chromium applicable controls', () => {
  for (const [engine, count] of [
    ['webkit', 22],
    ['chromium', 21],
  ]) {
    const { report, context } = speakNegatives(engine);
    const judged = validateVoiceReport('speak-negatives', report, context);
    assert(judged.passed, judged.errors.join(';'));
    assert.equal(judged.expectedCases.length, count);
    const missing = structuredClone(report);
    const index =
      engine === 'webkit' ? missing.rows.findIndex((row) => row.fault === 'blob-kept') : 0;
    const omitted = missing.rows.splice(index, 1)[0].fault;
    missing.expectedCases = missing.expectedCases.filter((id) => !id.endsWith(`/${omitted}`));
    missing.observedCases = [...missing.expectedCases];
    missing.requestedScope = missing.requestedScope.filter((id) => id !== omitted);
    missing.applicability[engine] = [...missing.requestedScope];
    assert.equal(
      validateVoiceReport('speak-negatives', missing, context).passed,
      false,
      'producer cannot redefine applicability to omit a control',
    );
    for (const status of ['skipped', 'not-run', 'error', 'timeout']) {
      const bad = structuredClone(report);
      bad.rows[0].status = status;
      assert.equal(
        validateVoiceReport('speak-negatives', bad, context).passed,
        false,
        `${status} is not a kill`,
      );
    }
  }
});
