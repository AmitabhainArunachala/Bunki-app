/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import {
  voiceReportContracts,
  validateVoiceReport,
  speakMutantKill,
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
  // INT-VH (2026-10-19): + Hfix-1B's S19 key-page row (120 → 121 per engine)
  assert.equal(report.checks.length, 121);
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
test('Speak requires strict true for every completed case and individual assertion', () => {
  for (const engine of ['chromium', 'webkit'])
    for (const key of ['cases', 'checks'])
      for (const value of [undefined, null, false, 0, 1, 'true']) {
        const { report, context } = speak(engine);
        report[key][0].pass = value;
        assert.equal(
          validateVoiceReport('speak', report, context).passed,
          false,
          `${engine}/${key}/${value}`,
        );
      }
});
test('Speak independently requires S23 and egress even when the producer declares its subset complete', () => {
  for (const omitted of ['S23', 'egress']) {
    const { report, context } = speak();
    report.cases = report.cases.filter((row) => row.case !== omitted);
    report.checks = report.checks.filter((row) => row.case !== omitted);
    report.expectedCases = report.observedCases = report.cases.map(
      (row) => `${row.engine}/${row.case}`,
    );
    assert.equal(voiceReportContracts.speak.expectedCases('chromium').length, 24);
    assert.equal(validateVoiceReport('speak', report, context).passed, false);
  }
});
const MUTATED_PRODUCER_COMPARATORS = {
  'original comparator': (helper) => `export { exactRoster } from ${JSON.stringify(helper)};\n`,
  'always-true comparator': () => 'export function exactRoster() { return true; }\n',
  'subset-accepting comparator': () =>
    'export function exactRoster(expected, observed) {\n' +
    '  return Array.isArray(observed) && observed.every((id) => expected.includes(id));\n' +
    '}\n',
  'duplicate-tolerant comparator': () =>
    'export function exactRoster(expected, observed) {\n' +
    '  return Array.isArray(observed) && expected.every((id) => observed.includes(id));\n' +
    '}\n',
};
function shrink(report, id) {
  const reduced = structuredClone(report);
  const gone = id(reduced.rows.pop());
  reduced.expectedCases = reduced.expectedCases.filter((x) => x !== gone);
  reduced.observedCases = reduced.observedCases.filter((x) => x !== gone);
  return reduced;
}
for (const [label, comparator] of Object.entries(MUTATED_PRODUCER_COMPARATORS))
  test(`a mutated producer helper (${label}, shrunk cases) cannot weaken any voice admission oracle`, async () => {
    const output = process.env.RUNNER_TEMP || join(homedir(), '.dharma', 'bunki', 'test-fixtures');
    mkdirSync(output, { recursive: true });
    const root = mkdtempSync(join(output, 'voice-oracle-'));
    try {
      const ci = join(root, 'scripts', 'ci'),
        tools = join(root, 'prototypes', 'corridor', 'tools');
      mkdirSync(ci, { recursive: true });
      mkdirSync(tools, { recursive: true });
      for (const name of ['vh-voice-report-contracts.mjs', 'vh-voice-rosters.mjs'])
        writeFileSync(join(ci, name), readFileSync(new URL(name, import.meta.url)));
      const originalHelper = new URL(
        '../../prototypes/corridor/tools/vh-voice-contracts.mjs',
        import.meta.url,
      ).href;
      writeFileSync(
        join(tools, 'vh-voice-contracts.mjs'),
        comparator(originalHelper) +
          `export const SPEAK_CASE_IDS = ['S1'];\n` +
          `export const SPEAK_CONTROL_IDS = ['revlog'];\n` +
          `export const SPEAK_CONTROL_IDS_BY_ENGINE = { webkit: ['revlog'], chromium: ['revlog'] };\n` +
          `export function speakCompletion() { return {fullAcceptance:true, observedCases:['chromium/S1','chromium/egress']}; }\n` +
          `export function adjudicateSpeakPhase() { return { ok: true, status: 'caught' }; }\n`,
      );
      const altered = await import(pathToFileURL(join(ci, 'vh-voice-report-contracts.mjs')).href);
      assert.equal(altered.voiceReportContracts.speak.expectedCases('chromium').length, 24);
      const full = speak();
      assert.equal(altered.validateVoiceReport('speak', full.report, full.context).passed, true);
      full.report.cases = full.report.cases.filter((row) => ['S1', 'egress'].includes(row.case));
      full.report.checks = full.report.checks.filter((row) => ['S1', 'egress'].includes(row.case));
      full.report.expectedCases = full.report.observedCases = ['chromium/S1', 'chromium/egress'];
      assert.equal(altered.validateVoiceReport('speak', full.report, full.context).passed, false);
      const judge = (name, report, context) =>
        altered.validateVoiceReport(name, report, context).passed;
      const sensed = sense();
      assert.equal(judge('sense-truth', sensed.report, sensed.context), true);
      assert.equal(
        judge(
          'sense-truth',
          shrink(sensed.report, (r) => `${r.engine}/${r.id}`),
          sensed.context,
        ),
        false,
        'Sense row roster shrunk',
      );
      const repeated = structuredClone(sensed.report);
      repeated.rows.push(structuredClone(repeated.rows[0]));
      repeated.observedCases.push(repeated.observedCases[0]);
      assert.equal(judge('sense-truth', repeated, sensed.context), false, 'duplicate Sense row');
      const copies = copyControls();
      assert.equal(judge('vh-voice-controls', copies.report, copies.context), true);
      assert.equal(
        judge(
          'vh-voice-controls',
          shrink(copies.report, (r) => r.control),
          copies.context,
        ),
        false,
        'copy-control roster shrunk',
      );
      const negatives = speakNegatives('webkit');
      assert.equal(judge('speak-negatives', negatives.report, negatives.context), true);
      const reduced = shrink(negatives.report, (r) => `${r.engine}/${r.fault}`);
      reduced.requestedScope.pop();
      reduced.applicability.webkit.pop();
      assert.equal(
        judge('speak-negatives', reduced, negatives.context),
        false,
        'Speak control roster shrunk',
      );
      const controls = senseControls('chromium');
      assert.equal(judge('vh-sense-controls', controls.report, controls.context), true);
      assert.equal(
        judge(
          'vh-sense-controls',
          shrink(controls.report, (r) => `${r.engine}/${r.control}`),
          controls.context,
        ),
        false,
        'Sense control roster shrunk',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
test('both Speak engines require their own timing row, never the other engine’s alternative', () => {
  for (const engine of ['chromium', 'webkit']) {
    const { report, context } = speak(engine);
    const judged = validateVoiceReport('speak', report, context);
    assert(judged.passed, judged.errors.join(';'));
    assert.equal(report.checks.length, 121);
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
function copyControls() {
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
  return { report, context };
}
test('copy controls require all six exact controls and unique nonce-bound completed mutant/restored sources', () => {
  const { report, context } = copyControls();
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
const D = 'd'.repeat(64);
const SENSE_TIMEOUT =
  'TimeoutError: controlled post-G navigation timeout\n    at grokCase (verify-sense-truth.mjs:550:73)';
// Rows, titles and observations as recorded by the retained Chromium/WebKit served-control receipts.
const RETAINED_SENSE_CONTROLS = {
  'discard-completed-red-on-retry': {
    fixture: 'ない, auxiliary (聞こえない)',
    candidate: ['G.ない, auxiliary (聞こえない)', 'P.ない, auxiliary (聞こえない)'],
    reds: [
      [
        'G.ない, auxiliary (聞こえない)',
        'adapt-n3:govonline:article-202609-radio-3741 #36: entry 1529520 sense 5, never "nonexistent"',
        {
          word: 'ない',
          reading: '',
          lines: ['VH wrong sense sentinel'],
          more: '',
          sense: '1529520:4',
          take: { disabled: false },
        },
      ],
      [
        'G.ない, auxiliary (聞こえない).incomplete',
        'the case completed without infrastructure failure',
        { error: SENSE_TIMEOUT, stage: 'navigation' },
      ],
    ],
  },
  'pronunciation-ta-promoted-to-door': {
    fixture: '悉曇（しったん）: た',
    candidate: ['G.悉曇（しったん）: た'],
    reds: [
      [
        'G.悉曇（しったん）: た',
        'bunki-read-n3-gojuon-sanskrit #233: independently bracketed reading is inert',
        { annotation: false, interactive: true, mini: true, sheet: false, rung: 'stage' },
      ],
    ],
  },
  'pronunciation-n-promoted-to-door': {
    fixture: '悉曇（しったん）: ん',
    candidate: ['G.悉曇（しったん）: ん'],
    reds: [
      [
        'G.悉曇（しったん）: ん',
        'bunki-read-n3-gojuon-sanskrit #234: independently bracketed reading is inert',
        { annotation: false, interactive: true, mini: true, sheet: false, rung: 'stage' },
      ],
    ],
  },
  'quoted-reading-demoted-to-annotation': {
    fixture: '「いちちゅう」: ちゅう',
    candidate: ['G.「いちちゅう」: ちゅう.classification', 'G.「いちちゅう」: ちゅう'],
    reds: [
      [
        'G.「いちちゅう」: ちゅう.classification',
        'the independently quoted reading is an interactive reading card, not an annotation',
        { annotation: true, interactive: false },
      ],
      [
        'G.「いちちゅう」: ちゅう',
        'a misclassified reading cannot satisfy its card contract',
        { annotation: true, interactive: false },
      ],
    ],
  },
};
function senseChild(engine, control, phase, nonce, runId) {
  const spec = RETAINED_SENSE_CONTROLS[control],
    mutant = phase === 'mutant',
    discard = mutant && control === 'discard-completed-red-on-retry';
  const rows = [
    ...(mutant
      ? spec.reds.map(([id, title, detail]) => ({
          engine,
          id,
          title,
          ok: false,
          observed: { attempt: 1, detail },
        }))
      : spec.candidate.map((id) => ({
          engine,
          id,
          title: id,
          ok: true,
          observed: { attempt: 1, detail: {} },
        }))),
    { engine, id: 'g.page-errors', title: 'g: no page errors', ok: true, observed: [] },
    {
      engine,
      id: 'S.retried',
      title: 'rows and taps run once more after a timeout (never after a wrong answer)',
      recorded: true,
      observed: { count: 0, retried: [] },
    },
  ];
  return {
    schemaVersion: 1,
    runId,
    nonce,
    artifactSha256: A,
    verifierSha256: D,
    engines: [engine],
    versions: { [engine]: '26.6' },
    fullAcceptance: false,
    selectedPassed: !mutant,
    complete: !discard,
    vhControl: mutant ? control : null,
    vhMutations: mutant ? [{ control, matches: 1, before: C, after: A }] : [],
    error: null,
    attempts: [
      {
        engine,
        fixture: spec.fixture,
        history: discard
          ? [
              {
                attempt: 1,
                observations: 1,
                complete: false,
                retry: false,
                stage: 'navigation',
                error: SENSE_TIMEOUT,
              },
            ]
          : [{ attempt: 1, observations: spec.reds.length, complete: true }],
      },
    ],
    rows,
  };
}
function senseControls(engine) {
  const { report, context } = base('vh-sense-controls', engine),
    children = new Map();
  context.producerHashes = { 'prototypes/corridor/tools/verify-sense-truth.mjs': D };
  report.selected = null;
  report.engines = [engine];
  report.sourceDigest = C;
  report.rows = SENSE_CONTROL_IDS.map((control) => ({
    engine,
    control,
    status: 'caught',
    restored: true,
    phases: ['baseline', 'mutant', 'restore'].map((phase) => {
      const nonce = `${engine}-${control}-${phase}`,
        dir = `/${phase}-${nonce}`;
      children.set(
        `${dir}/verify-sense-truth.json`,
        senseChild(engine, control, phase, nonce, context.runId),
      );
      return { phase, dir, nonce, exit: phase === 'mutant' ? 1 : 3, ok: true, fresh: true };
    }),
  }));
  context.readReport = (path) => structuredClone(children.get(path));
  return { report, context, children };
}
const senseRow = (children, report, control, phase, id) =>
  children
    .get(
      `${report.rows.find((r) => r.control === control).phases.find((p) => p.phase === phase).dir}/verify-sense-truth.json`,
    )
    .rows.find((row) => row.id === id);
test('Sense controls admit the retained complete served-control evidence on both engines', () => {
  for (const engine of ['chromium', 'webkit']) {
    const { report, context } = senseControls(engine);
    const judged = validateVoiceReport('vh-sense-controls', report, context);
    assert(judged.passed, `${engine}: ${judged.errors.join(';')}`);
  }
});
test('Sense controls reread fresh child receipts; caught labels with missing nonce/semantic rows do not suffice', () => {
  const { report, context } = senseControls('chromium');
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
test('Sense controls count only exact false intended reds with complete named witnesses; skip/null/missing never kill', () => {
  for (const [control, id] of [
    ['discard-completed-red-on-retry', 'G.ない, auxiliary (聞こえない)'],
    ['discard-completed-red-on-retry', 'G.ない, auxiliary (聞こえない).incomplete'],
    ['pronunciation-ta-promoted-to-door', 'G.悉曇（しったん）: た'],
    ['quoted-reading-demoted-to-annotation', 'G.「いちちゅう」: ちゅう.classification'],
    ['quoted-reading-demoted-to-annotation', 'G.「いちちゅう」: ちゅう'],
  ]) {
    for (const [label, mutate] of [
      ['ok null', (row) => (row.ok = null)],
      ['ok undefined', (row) => delete row.ok],
      ['ok skip', (row) => (row.ok = 'skip')],
      ['ok 0', (row) => (row.ok = 0)],
      ['observation missing', (row) => delete row.observed],
      ['observation detail missing', (row) => (row.observed = { attempt: 1 })],
      ['observation detail empty', (row) => (row.observed.detail = {})],
      ['recorded skip marker', (row) => (row.recorded = 'skip')],
    ]) {
      const { report, context, children } = senseControls('chromium');
      mutate(senseRow(children, report, control, 'mutant', id));
      assert.equal(
        validateVoiceReport('vh-sense-controls', report, context).passed,
        false,
        `${control}/${id}: ${label}`,
      );
    }
  }
  const { report, context, children } = senseControls('chromium');
  senseRow(
    children,
    report,
    'discard-completed-red-on-retry',
    'mutant',
    'G.ない, auxiliary (聞こえない)',
  ).observed.detail.lines.splice(0, 1, 'the real sense');
  assert.equal(validateVoiceReport('vh-sense-controls', report, context).passed, false);
});
test('Sense control unrelated and candidate rows must be exactly true; a hidden skipped row cannot pass', () => {
  for (const phase of ['baseline', 'mutant', 'restore'])
    for (const value of [null, undefined, 'skip', 1, 'true']) {
      const { report, context, children } = senseControls('webkit');
      const row = senseRow(
        children,
        report,
        'pronunciation-n-promoted-to-door',
        phase,
        'g.page-errors',
      );
      if (value === undefined) delete row.ok;
      else row.ok = value;
      assert.equal(
        validateVoiceReport('vh-sense-controls', report, context).passed,
        false,
        `${phase}: page-errors ${value}`,
      );
    }
  for (const value of [null, undefined, 'skip']) {
    const { report, context, children } = senseControls('webkit');
    const row = senseRow(
      children,
      report,
      'quoted-reading-demoted-to-annotation',
      'restore',
      'G.「いちちゅう」: ちゅう',
    );
    if (value === undefined) delete row.ok;
    else row.ok = value;
    assert.equal(validateVoiceReport('vh-sense-controls', report, context).passed, false);
  }
  const { report, context, children } = senseControls('webkit');
  const mutant = children.get(`${report.rows[1].phases[1].dir}/verify-sense-truth.json`);
  mutant.rows.push({
    engine: 'webkit',
    id: 'G.hidden',
    title: 'hidden',
    recorded: 'skip',
    ok: false,
  });
  assert.equal(validateVoiceReport('vh-sense-controls', report, context).passed, false);
});
test('Sense classification kills need the actual promoted or demoted interaction, with no skipped execution', () => {
  for (const engine of ['chromium', 'webkit'])
    for (const control of SENSE_CONTROL_IDS.slice(1)) {
      const { report, context, children } = senseControls(engine);
      const child = children.get(
        `${report.rows.find((row) => row.control === control).phases[1].dir}/verify-sense-truth.json`,
      );
      for (const row of child.rows.filter((row) => row.ok === false)) {
        Object.assign(
          row.observed.detail,
          control === 'quoted-reading-demoted-to-annotation'
            ? { annotation: false, interactive: true }
            : { annotation: true, interactive: false },
        );
      }
      assert.equal(
        validateVoiceReport('vh-sense-controls', report, context).passed,
        false,
        `${engine}/${control}`,
      );
    }
  for (const phase of ['baseline', 'mutant', 'restore'])
    for (const marker of [
      { skipped: true },
      { skip: true },
      { unexecuted: true },
      { timedOut: true },
      { harnessError: 'setup failed' },
      { status: 'not-run' },
    ])
      for (const location of ['row', 'observed']) {
        const { report, context, children } = senseControls('chromium');
        const row = senseRow(
          children,
          report,
          'pronunciation-ta-promoted-to-door',
          phase,
          'G.悉曇（しったん）: た',
        );
        Object.assign(location === 'row' ? row : row.observed, marker);
        assert.equal(
          validateVoiceReport('vh-sense-controls', report, context).passed,
          false,
          `${phase}/${location}/${JSON.stringify(marker)}`,
        );
      }
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
          pass: checks.filter((r) => r.case === id).every((r) => r.pass),
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
test('Speak mutant children are confined to the selected cases: an unexpected case, red or green, never passes', () => {
  const { report, context, children } = speakNegatives('chromium');
  const row = report.rows.find((r) => r.fault === 'device-voice');
  for (const phase of ['baseline', 'mutant', 'restore'])
    for (const pass of [false, true]) {
      const receipt = children.get(`${row[phase].evidence}/verify-speak.json`);
      receipt.checks.push({ engine: 'chromium', case: 'S4', name: SPEAK_CHECK_NAMES.S4[0], pass });
      assert.equal(
        validateVoiceReport('speak-negatives', report, context).passed,
        false,
        `${phase}: unexpected S4 ${pass ? 'green' : 'red'}`,
      );
      receipt.checks.pop();
    }
  const judged = validateVoiceReport('speak-negatives', report, context);
  assert(judged.passed, judged.errors.join(';'));
});
test('Speak mutant setup errors, spawn failures, child errors and timeouts are never kills', () => {
  for (const mutate of [
    (row) => (row.mutant.error = 'setup failed'),
    (row) => (row.mutant.spawnError = 'ENOENT'),
    (row) => (row.mutant.signal = 'SIGKILL'),
    (row) => (row.mutant.timedOut = true),
    (row) => (row.restore.timedOut = true),
    (row) => (row.baseline.error = 'setup failed'),
    (row) => (row.status = 'setup-error'),
  ]) {
    const { report, context } = speakNegatives('webkit');
    mutate(report.rows[0]);
    assert.equal(validateVoiceReport('speak-negatives', report, context).passed, false);
  }
  const { report, context, children } = speakNegatives('webkit');
  const mutant = children.get(`${report.rows[0].mutant.evidence}/verify-speak.json`);
  mutant.error = 'browserType.launch: setup failed';
  assert.equal(validateVoiceReport('speak-negatives', report, context).passed, false);
  delete mutant.error;
  mutant.pageErrors = ['setup'];
  assert.equal(validateVoiceReport('speak-negatives', report, context).passed, false);
});
const speakChild = (children, report, fault, phase) =>
  children.get(`${report.rows.find((r) => r.fault === fault)[phase].evidence}/verify-speak.json`);
test('Speak intended kills are exact false named witnesses; null, undefined, skip or nameless rows never kill', () => {
  const witness = SPEAK_MUTANT_SPEC['device-voice'].witness;
  for (const [label, mutate] of [
    ['pass null', (row) => (row.pass = null)],
    ['pass undefined', (row) => delete row.pass],
    ['pass skip', (row) => (row.pass = 'skip')],
    ['pass 0', (row) => (row.pass = 0)],
    ['pass "false"', (row) => (row.pass = 'false')],
    ['nameless witness', (row) => (row.name = '')],
    ['witness removed', (row, child) => child.checks.splice(child.checks.indexOf(row), 1)],
  ])
    for (const id of Object.keys(witness)) {
      const { report, context, children } = speakNegatives('chromium');
      const child = speakChild(children, report, 'device-voice', 'mutant');
      const row = child.checks.find(
        (c) => c.case === id && new RegExp(witness[id], 'u').test(c.name),
      );
      mutate(row, child);
      assert.equal(
        validateVoiceReport('speak-negatives', report, context).passed,
        false,
        `${id}: ${label}`,
      );
    }
});
test('Speak unrelated, downstream and candidate rows must be exact booleans; unrelated rows exactly true', () => {
  for (const phase of ['baseline', 'mutant', 'restore'])
    for (const value of [null, undefined, 'skip', 1]) {
      const { report, context, children } = speakNegatives('webkit');
      const child = speakChild(children, report, 'charon-main', phase);
      const row = child.checks.find((c) => c.pass === true);
      if (value === undefined) delete row.pass;
      else row.pass = value;
      assert.equal(
        validateVoiceReport('speak-negatives', report, context).passed,
        false,
        `${phase}: unrelated ${value}`,
      );
    }
  for (const value of [null, undefined, 'skip']) {
    const { report, context, children } = speakNegatives('webkit');
    const child = speakChild(children, report, 'charon-main', 'mutant');
    const name = SPEAK_MUTANT_SPEC['charon-main'].downstream.S9[0];
    const row = child.checks.find((c) => c.case === 'S9' && c.name === name);
    if (value === undefined) delete row.pass;
    else row.pass = value;
    assert.equal(
      validateVoiceReport('speak-negatives', report, context).passed,
      false,
      `downstream ${value}`,
    );
  }
  for (const phase of ['baseline', 'restore'])
    for (const value of [null, undefined, false]) {
      const { report, context, children } = speakNegatives('webkit');
      const child = speakChild(children, report, 'revlog', phase);
      if (value === undefined) delete child.cases[0].pass;
      else child.cases[0].pass = value;
      assert.equal(
        validateVoiceReport('speak-negatives', report, context).passed,
        false,
        `${phase}: case pass ${value}`,
      );
    }
  const { report, context, children } = speakNegatives('webkit');
  const child = speakChild(children, report, 'charon-main', 'mutant');
  const name = SPEAK_MUTANT_SPEC['charon-main'].downstream.S9[0];
  child.checks.find((c) => c.case === 'S9' && c.name === name).pass = false;
  const judged = validateVoiceReport('speak-negatives', report, context);
  assert(judged.passed, judged.errors.join(';'));
});
test('Speak control execution markers reject even a correctly named boolean witness or green prerequisite', () => {
  for (const phase of ['baseline', 'mutant', 'restore'])
    for (const marker of [
      { skipped: true },
      { skip: true },
      { unexecuted: true },
      { timedOut: true },
      { harnessError: 'setup failed' },
      { status: 'not-run' },
    ])
      for (const collection of ['checks', 'cases']) {
        const { report, context, children } = speakNegatives('webkit');
        const child = speakChild(children, report, 'device-voice', phase);
        Object.assign(child[collection][0], marker);
        assert.equal(
          validateVoiceReport('speak-negatives', report, context).passed,
          false,
          `${phase}/${collection}/${JSON.stringify(marker)}`,
        );
      }
});
test('a mutant witness must be an explicit non-empty expression for a selected case', () => {
  const name = SPEAK_MUTANT_SPEC['device-voice'].witness.S2;
  const checks = [{ engine: 'chromium', case: 'S2', name, pass: false }];
  const kill = speakMutantKill({ witness: { S2: name }, downstream: {} }, checks, 'chromium');
  assert.deepEqual([kill.scoped, kill.witnessed, kill.unrelatedClean], [true, true, true]);
  for (const witness of [{}, { S2: '' }, { S2: undefined }, { S2: null }, { S9: name }]) {
    const judged = speakMutantKill({ witness, downstream: {} }, checks, 'chromium');
    assert.equal(judged.scoped && judged.witnessed && judged.unrelatedClean, false);
  }
  assert.equal(speakMutantKill(undefined, checks, 'chromium').witnessed, false);
  for (const pass of [null, undefined, 'skip', 0, 'false']) {
    const judged = speakMutantKill(
      { witness: { S2: name }, downstream: {} },
      [{ engine: 'chromium', case: 'S2', name, pass }],
      'chromium',
    );
    assert.equal(judged.scoped && judged.witnessed && judged.unrelatedClean, false, `${pass}`);
    assert.equal(judged.green, false, `${pass} is not green`);
  }
  const green = speakMutantKill(
    { witness: { S2: name }, downstream: {} },
    [{ engine: 'chromium', case: 'S2', name, pass: true }],
    'chromium',
  );
  assert.deepEqual([green.scoped, green.green, green.witnessed], [true, true, false]);
  assert.equal(
    speakMutantKill({ witness: { S2: name }, downstream: {} }, checks, 'webkit').scoped,
    false,
  );
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
