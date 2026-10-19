/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retainedReportContracts, driftFastSchedule } from './vh-retained-report-contracts.mjs';
import {
  INVENTORY as PRODUCER_WORD_INVENTORY,
  LEARNING_RECORD_CONTROLS,
  WORD_CONTROLS,
} from '../../prototypes/corridor/tools/word-saved-answer-controls.mjs';
const SITE = mkdtempSync(join(tmpdir(), 'vh-retained-site-')),
  OTHER_SITE = mkdtempSync(join(tmpdir(), 'vh-retained-other-')),
  LINKS = mkdtempSync(join(tmpdir(), 'vh-retained-link-')),
  SITE_LINK = join(LINKS, 'site');
symlinkSync(SITE, SITE_LINK);
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
    site: SITE,
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
    results: expected.map((name) =>
      name === 'C1/sentence-home'
        ? {
            name: 'C1 · the sentence page walks on to the whole article it came from',
            pass: true,
            detail: JSON.stringify({
              present: true,
              label: 'この記事を読むread the source article',
              view: 'reader',
              reader: true,
              sheet: false,
              from: '年',
            }),
          }
        : { name, pass: true },
    ),
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
      'word-saved-answer-mutation-controls': 38,
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
const MUTATION = 'word-saved-answer-mutation-controls';
for (const name of Object.keys(retainedReportContracts).filter((name) => name !== MUTATION))
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
        { site: OTHER_SITE },
        { site: join(SITE, 'missing') },
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
test('served-site identity compares real paths on both sides', () => {
  for (const name of Object.keys(retainedReportContracts)) {
    const { report, context, contract } = fixture(name);
    if (contract.sourceOnly) continue;
    for (const site of [SITE_LINK, `${SITE}/`, `${SITE_LINK}/`]) {
      const judged = contract.validate(report, { ...context, site });
      assert(judged.passed, `${name} ${site}: ${judged.errors.join(';')}`);
      const linked = structuredClone(report);
      linked.artifact.path = site;
      assert(contract.validate(linked, context).passed, `${name} report ${site}`);
    }
    const foreign = structuredClone(report);
    foreign.artifact.path = OTHER_SITE;
    assert.equal(contract.validate(foreign, context).passed, false, name);
    assert.equal(contract.validate(report, { ...context, site: '' }).passed, false, name);
  }
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
test('Corridor C1 admits only the article-backed sentence-home walk, never the always-true fallback', () => {
  const { report, context, contract } = fixture('corridor');
  assert.deepEqual(contract.validate(report, context).errors, []);
  const fallback = structuredClone(report);
  Object.assign(
    fallback.results.find((row) => row.name.startsWith('C1 ·')),
    {
      name: 'C1 · a sentence with no shelf article shows no door onto nothing',
      detail: 'no article-backed sentence page reached in this walk — honest absence path',
    },
  );
  assert.equal(contract.validate(fallback, context).passed, false, 'fallback branch');
  const both = structuredClone(report);
  both.results.push({
    name: 'C1 · a sentence with no shelf article shows no door onto nothing',
    pass: true,
  });
  both.summary.total++;
  assert.equal(contract.validate(both, context).passed, false, 'fallback beside article row');
  for (const detail of [
    undefined,
    'not json',
    JSON.stringify({ present: false, reader: true, sheet: false }),
    JSON.stringify({ present: true, reader: false, sheet: false }),
    JSON.stringify({ present: true, reader: true, sheet: true }),
    JSON.stringify({ present: true, reader: true }),
  ]) {
    const bad = structuredClone(report);
    bad.results.find((row) => row.name.startsWith('C1 ·')).detail = detail;
    assert.equal(contract.validate(bad, context).passed, false, String(detail));
  }
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
const ROOT = fileURLToPath(new globalThis.URL('../..', import.meta.url));
const MUTATION_PRODUCER = 'prototypes/corridor/tools/test-word-saved-answer.mjs';
const digestOf = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pinnedPaths = {
  'corridor.js': 'prototypes/corridor/corridor.js',
  'test-word-saved-answer.mjs': MUTATION_PRODUCER,
  'word-saved-answer-controls.mjs': 'prototypes/corridor/tools/word-saved-answer-controls.mjs',
  'verify-learning-record.mjs': 'prototypes/corridor/tools/verify-learning-record.mjs',
  'dict-v2/index.json': 'prototypes/corridor/data/share_alike/dict-v2/index.json',
  'dict.json': 'prototypes/corridor/data/share_alike/dict.json',
  'words.json': 'prototypes/corridor/data/share_alike/words.json',
};
const learningInventory = [
  'grade-rejection-keeps-schedule-log-stats-and-session-with-double-tap-guard',
  'queued-grade-recomputes-latest-card-and-preserves-concurrent-log-and-stats',
  'not-recalled-forces-again-even-if-another-grade-is-requested',
  'review-does-not-advance-a-replacement-session-after-ack',
  'stale-grade-refuses-removed-or-suspended-card-without-lost-latest-data',
  'undo-is-atomic-append-only-and-rejection-keeps-the-grade',
  'undo-does-not-overwrite-a-later-card-change',
  'acknowledged-grade-disposes-question-view-and-clears-transient-response-state',
  'undo-after-ungraded-skip-restores-the-actual-graded-item-and-removes-only-its-reinsertion',
  'dojo-evidence-waits-for-ack-and-never-creates-schedule-state',
  'show-answer-turns-the-card-without-a-write-and-ignores-a-second-press',
  'word-review-render-fixture-starts-unbound',
  'word-review-shows-and-binds-its-saved-answer',
  'word-review-unavailable-face-refuses-grades-and-writes-nothing',
  'word-review-changed-answer-refuses-both-producers-and-asks-for-a-fresh-look',
  'quiz-answer-next-and-close-use-only-acknowledged-run-and-ignore-stale-buttons',
  'lesson-completion-atomically-files-score-and-evidence-after-ack',
  'explicit-enrollment-batch-is-one-save-deduplicated-and-keeps-deep-word-provenance',
  'probe-mint-and-evidence-wait-together-and-double-input-cannot-mint-twice',
  'preference-step-merges-latest-pacing-without-publishing-unacknowledged-value',
  'pace-panel-offers-three-presets-and-names-a-hand-set-schedule-custom',
  'g2-definitions-lifted-from-the-authored-source',
  'g2-identity-is-the-word-as-it-reads-never-the-spelling-alone',
  'g2-depth-boundaries-need-stability-and-present-recall',
  'g2-a-different-reading-or-entry-is-at-most-met-and-never-rings',
  'g2-golden-訳-read-やく-never-inherits-わけ',
  'g2-not-yet-outranks-until-an-unrevoked-good-review-after-it',
  'g2-kept-is-review-or-a-list-for-the-same-word-only',
  'g2-a-look-up-writes-the-encounter-ledger-only-once-a-day',
  'g2-his-correction-writes-met-only-and-toggles',
  'g2-the-roots-validate-strictly-and-keep-later-versions',
  'g2-help-per-1000-characters-counts-first-readings-once',
  'g2-a-kept-word-answers-cold-from-its-own-card',
];
const tapOutput = (marker, rows) => {
  const ids = Object.keys(rows),
    failed = ids.filter((id) => !rows[id]).length;
  return [
    marker,
    'TAP version 13',
    ...ids.map((id, i) => `${rows[id] ? 'ok' : 'not ok'} ${i + 1} - ${id} synthetic row`),
    `1..${ids.length}`,
    `# tests ${ids.length}`,
    '# suites 0',
    `# pass ${ids.length - failed}`,
    `# fail ${failed}`,
    '# cancelled 0',
    '# skipped 0',
    '# todo 0',
    '',
  ].join('\n');
};
// Synthetic, labelled: no child here ran. It is shaped like runControls' output from the current
// control tables and pinned files, so the consumer's positive path and each negative can execute.
function syntheticMutationControls({
  word = WORD_CONTROLS,
  learning = LEARNING_RECORD_CONTROLS,
} = {}) {
  const pins = Object.fromEntries(
    Object.entries(pinnedPaths).map(([key, path]) => [
      key,
      { path, sha256: digestOf(readFileSync(join(ROOT, path))) },
    ]),
  );
  const authored = pins['corridor.js'].sha256,
    model = { records: {}, stdout: {}, stderr: {}, receipts: {} };
  const verdicts = [],
    childIds = [];
  const add = (id, kind, name, table, rows) => {
    const control = name ? table[name] : null,
      source = name ? digestOf(`synthetic ${id} ${authored}`) : authored;
    const failed = Object.keys(rows).filter((key) => !rows[key]);
    const verdict = name
      ? {
          suite: kind === 'tap' ? 'test-word-saved-answer' : 'verify-learning-record',
          control: name,
          note: control.note,
          verdict: 'killed',
          failed,
        }
      : null;
    if (verdict) verdicts.push({ ...verdict, child: id });
    childIds.push(id);
    model.records[id] = {
      format: 'd23-child-evidence',
      version: 1,
      child: id,
      kind,
      role: name ? 'control' : 'baseline',
      control: name,
      mutation: {
        table: name ? (kind === 'tap' ? 'WORD_CONTROLS' : 'LEARNING_RECORD_CONTROLS') : null,
        edits: name ? control.edits : null,
        authoredSha256: authored,
        sourceSha256: source,
      },
      marker:
        kind === 'tap'
          ? `# d23-source ${name || 'baseline'} ${name ? control.edits.length : 0} ${source}`
          : name
            ? `CONTROL-APPLIED ${name} ${source}`
            : null,
      status: name ? 1 : 0,
      signal: null,
      error: null,
      receipt: null,
      observation: { complete: true, problems: [], rows },
      verdict,
    };
    if (kind === 'tap') {
      model.stdout[id] = tapOutput(model.records[id].marker, rows);
      model.stderr[id] = '';
    } else {
      const results = Object.entries(rows).map(([result, ok]) =>
        ok
          ? { name: result, pass: true }
          : { name: result, pass: false, diagnostic: `FAIL ${result}: bit` },
      );
      model.receipts[id] = {
        format: 'kairo-learning-acknowledgment-tests',
        version: 1,
        ...(name ? { control: name } : {}),
        sourceSha256: source,
        results,
        pass: results.every((result) => result.pass),
      };
      model.stdout[id] =
        (name ? `CONTROL-APPLIED ${name} ${source}\n` : '') +
        results.map((result) => `${result.pass ? 'PASS' : 'FAIL'} ${result.name}\n`).join('');
      model.stderr[id] = results
        .filter((result) => !result.pass)
        .map((result) => `${result.diagnostic}\n`)
        .join('');
    }
  };
  const tapRows = (witnesses = []) =>
    Object.fromEntries(PRODUCER_WORD_INVENTORY.map((id) => [id, !witnesses.includes(id)]));
  add('tap-baseline', 'tap', null, word, tapRows());
  for (const [name, control] of Object.entries(word))
    add(`tap-${name}`, 'tap', name, word, tapRows(control.witnesses));
  const learningRows = (witnesses = []) =>
    Object.fromEntries(learningInventory.map((id) => [id, !witnesses.includes(id)]));
  add('learning-baseline', 'receipt', null, learning, learningRows());
  for (const [name, control] of Object.entries(learning))
    add(`learning-${name}`, 'receipt', name, learning, learningRows(control.witnesses));
  model.report = {
    synthetic: 'lane-D unit fixture; no child process ran',
    format: 'd23-control-admission',
    version: 2,
    root: ROOT,
    execPath: process.execPath,
    nodeVersion: process.version,
    phase: {
      children: childIds.length,
      expectedChildren: childIds.length,
      controls: verdicts.length,
      bounds: { timeoutMs: 300000, killSignal: 'SIGKILL', maxBufferBytesPerStream: 16777216 },
      totalBound: null,
    },
    pins: { before: pins, after: structuredClone(pins), stable: true },
    stage: { dir: 'assessment-stage', files: {} },
    inventory: [...PRODUCER_WORD_INVENTORY],
    learningInventory: [...learningInventory],
    childIds,
    verdicts,
    pass: true,
  };
  return model;
}
function materialize(model) {
  const out = mkdtempSync(join(tmpdir(), 'vh-mutation-controls-')),
    gate = join(out, MUTATION),
    startedAt = new Date(Date.now() - 60_000).toISOString();
  mkdirSync(join(gate, 'children'), { recursive: true });
  const children = [];
  for (const id of model.report.childIds) {
    const record = structuredClone(model.records[id]);
    for (const stream of ['stdout', 'stderr']) {
      const bytes = Buffer.from(model[stream][id], 'utf8');
      writeFileSync(join(gate, 'children', `${id}.${stream}`), bytes);
      record[stream] = { path: `${id}.${stream}`, bytes: bytes.length, sha256: digestOf(bytes) };
    }
    if (model.receipts[id]) {
      const bytes = Buffer.from(JSON.stringify(model.receipts[id], null, 2) + '\n', 'utf8');
      mkdirSync(join(gate, `${id}-fixture`));
      writeFileSync(join(gate, `${id}-fixture`, 'learning-record.json'), bytes);
      record.receipt = {
        path: `${id}-fixture/learning-record.json`,
        bytes: bytes.length,
        sha256: digestOf(bytes),
      };
    }
    const bytes = Buffer.from(JSON.stringify(record, null, 2) + '\n', 'utf8');
    writeFileSync(join(gate, 'children', `${id}.json`), bytes);
    children.push({
      child: id,
      role: record.role,
      control: record.control,
      evidence: `children/${id}.json`,
      evidenceSha256: digestOf(bytes),
      complete: record.observation.complete,
      problems: record.observation.problems,
      verdict: record.verdict?.verdict ?? null,
    });
  }
  const report = { ...model.report, children };
  delete report.childIds;
  writeFileSync(join(gate, 'controls-report.json'), JSON.stringify(report, null, 2) + '\n');
  const context = {
    root: ROOT,
    out,
    gateId: MUTATION,
    startedAt,
    args: [MUTATION_PRODUCER, '--controls'],
    verifierSha256: model.report.pins.before['test-word-saved-answer.mjs'].sha256,
    sourceVerifiedBeforeAndAfter: true,
    readReport: (path) => JSON.parse(readFileSync(join(gate, path), 'utf8')),
  };
  return { report, context, gate };
}
const judgeMutation = (model, patch = (fx) => fx) => {
  const fx = patch(materialize(model));
  return retainedReportContracts[MUTATION].validate(fx.report, fx.context);
};
test('word-saved-answer mutation controls: a complete synthetic schedule of 38 children is admitted', () => {
  const judged = judgeMutation(syntheticMutationControls());
  assert.deepEqual(judged.errors, []);
  assert.equal(judged.passed, true);
  assert.deepEqual(
    [...judged.observedCases].sort(),
    [...retainedReportContracts[MUTATION].expectedCases()].sort(),
  );
  assert.equal(judged.observedCases.length, 38);
});
test('word-saved-answer mutation controls: survived, missing, tampered, unstable and reduced schedules reject', () => {
  const fail = (label, model, patch) =>
    assert.equal(judgeMutation(model, patch).passed, false, label);
  const fresh = () => syntheticMutationControls();
  const retap = (m, id) => {
    m.stdout[id] = tapOutput(m.records[id].marker, m.records[id].observation.rows);
  };
  let m = fresh();
  m.records['tap-C1'].observation.rows.T1 = true;
  m.records['tap-C1'].verdict = { ...m.records['tap-C1'].verdict, verdict: 'survived', failed: [] };
  m.report.verdicts.find((row) => row.control === 'C1').verdict = 'survived';
  m.report.pass = false;
  retap(m, 'tap-C1');
  fail('survived control', m);
  m = fresh();
  m.records['tap-C1'].observation.rows.T1 = true;
  m.records['tap-C1'].verdict.failed = [];
  retap(m, 'tap-C1');
  fail('survivor relabelled killed', m);
  m = fresh();
  m.report.childIds = m.report.childIds.filter((id) => id !== 'tap-KX5');
  fail('missing child', m);
  fail('tampered child record', fresh(), (fx) => {
    const file = join(fx.gate, 'children', 'tap-C2.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"status": 1', '"status":  1'));
    return fx;
  });
  fail('tampered child sha', fresh(), (fx) => {
    fx.report.children[3].evidenceSha256 = 'f'.repeat(64);
    return fx;
  });
  fail('tampered raw stdout', fresh(), (fx) => {
    writeFileSync(join(fx.gate, 'children', 'tap-C3.stdout'), 'ok 1 - F0\n');
    return fx;
  });
  m = fresh();
  m.report.pins.after['corridor.js'] = { ...m.report.pins.after['corridor.js'], sha256: A };
  m.report.pins.stable = false;
  fail('unstable pins', m);
  m = fresh();
  m.report.pins.after['dict.json'] = { ...m.report.pins.after['dict.json'], sha256: A };
  fail('pins before/after differ though marked stable', m);
  m = fresh();
  for (const side of ['before', 'after']) m.report.pins[side]['corridor.js'].sha256 = A;
  fail('stable pins of another corridor.js', m);
  const reduced = { ...WORD_CONTROLS };
  delete reduced.KX5;
  fail('reduced self-consistent roster', syntheticMutationControls({ word: reduced }));
  fail(
    'reduced learning roster',
    syntheticMutationControls({ learning: { RB: LEARNING_RECORD_CONTROLS.RB } }),
  );
  fail(
    'producer witnesses narrowed',
    syntheticMutationControls({
      word: { ...WORD_CONTROLS, C5: { ...WORD_CONTROLS.C5, witnesses: ['T12'] } },
    }),
  );
  m = fresh();
  Object.assign(m.records['tap-C4'], { status: null, signal: 'SIGKILL' });
  fail('timeout counted as kill', m);
  m = fresh();
  m.records['tap-C4'].error = { class: 'timeout', code: 'ETIMEDOUT', message: 'ETIMEDOUT' };
  fail('spawn error counted as kill', m);
  m = fresh();
  m.stdout['tap-C6a'] = m.stdout['tap-C6a'].replace(
    /^not ok (\d+) - T8 synthetic row$/mu,
    'ok $1 - T8 synthetic row # SKIP',
  );
  fail('skipped witness counted as kill', m);
  m = fresh();
  m.stdout['tap-C7'] = m.stdout['tap-C7'].replace('# cancelled 0', '# cancelled 1');
  fail('cancelled row', m);
  m = fresh();
  m.records['tap-C8'].observation.rows['T2.setup'] = false;
  m.records['tap-C8'].verdict.failed.push('T2.setup');
  retap(m, 'tap-C8');
  fail('witness setup red', m);
  m = fresh();
  m.records['tap-C1'].observation.rows.T4 = false;
  m.records['tap-C1'].verdict.failed.push('T4');
  retap(m, 'tap-C1');
  fail('an unrelated red row is not a clean kill even when producer labels it killed', m);
  m = fresh();
  m.records['tap-baseline'].observation.rows.T1 = false;
  retap(m, 'tap-baseline');
  fail('baseline red', m);
  m = fresh();
  m.records['tap-C10'].mutation.sourceSha256 = m.records['tap-C10'].mutation.authoredSha256;
  fail('control lifted the authored source', m);
  m = fresh();
  m.report.learningInventory.pop();
  fail('learning inventory reduced', m);
  m = fresh();
  m.report.inventory.pop();
  fail('word inventory reduced', m);
  m = fresh();
  m.receipts['learning-RB'].results.find((row) => !row.pass).pass = true;
  fail('learning receipt disagrees with rows', m);
  m = fresh();
  const absent = m.receipts['learning-RB'].results.find((row) => !row.pass);
  delete absent.pass;
  fail('missing learning witness pass flag is not a measured false', m);
  m = fresh();
  const results = m.receipts['learning-baseline'].results;
  results[0] = { ...results[1] };
  fail('duplicate learning result cannot hide an omitted result', m);
  m = fresh();
  m.stderr['learning-C6b'] = '';
  fail('learning stderr differs from diagnostics', m);
  for (const args of [
    [MUTATION_PRODUCER],
    [MUTATION_PRODUCER, '--controls', '--control', 'C1'],
    ['prototypes/corridor/tools/test-word-saved-answer-controls.mjs', '--controls'],
  ])
    fail(`args ${args.join(' ')}`, fresh(), (fx) => {
      fx.context.args = args;
      return fx;
    });
  fail('source boundary unverified', fresh(), (fx) => {
    fx.context.sourceVerifiedBeforeAndAfter = false;
    return fx;
  });
  fail('another checkout', fresh(), (fx) => {
    fx.report.root = SITE;
    return fx;
  });
  fail('wrong producer identity', fresh(), (fx) => {
    fx.context.verifierSha256 = B;
    return fx;
  });
  fail('stale raw output', fresh(), (fx) => {
    fx.context.startedAt = new Date(Date.now() + 60_000).toISOString();
    return fx;
  });
  const fx = materialize(fresh());
  for (const malformed of [null, {}, [], { children: [null] }])
    assert.equal(
      retainedReportContracts[MUTATION].validate(malformed, fx.context).passed,
      false,
      JSON.stringify(malformed),
    );
});
