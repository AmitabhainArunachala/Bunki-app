import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  learningReportContracts,
  READER_CASES,
  READER_CONTROLS,
  READER_RUN_ROWS,
  READER_D1_DAY,
  READER_D1_PICKS,
  PUBLIC_DISCLOSURE,
} from './vh-learning-report-contracts.mjs';
import { REPORT_COPY_CONTROL_SPECS } from './vh-learning-rosters.mjs';
import { validateGateEvidence } from './gate-evidence.mjs';
import { digest } from './verification-admission.mjs';
import {
  RECORD_ROWS,
  RECORD_CONTROLS,
  expectedReportChecks,
  REPORT_COPY_CONTROLS,
} from '../../prototypes/corridor/tools/vh-learning-contracts.mjs';
const base = {
  runId: 'candidate',
  gitSha: 'a'.repeat(40),
  artifactSha256: 'b'.repeat(64),
  verifierSha256: 'c'.repeat(64),
  fullAcceptance: true,
};
const DIGEST = Object.freeze({
  'corridor.js': 'd'.repeat(64),
  'data/articles/aozora-046605.json': '1'.repeat(64),
});
const FOREIGN = 'f'.repeat(64);
const runtimeFiles = Object.entries(DIGEST).map(([path, sha256]) => ({ path, sha256 }));
const context = { engine: 'chromium', ...base, runtimeFiles };
const deliveryContext = { ...context, engine: 'all' };
const shelf = (width) => `D1 ${width}: today's picks are on the shelf`;
const clone = (x) => globalThis.structuredClone(x),
  triplet = (x) => ['tap', 'Enter', 'Space'].map((how) => ({ how, ...x }));
const served = (key, file = 'corridor.js') => [
  {
    file,
    baseSha256: DIGEST[file],
    mutantSha256: 'e'.repeat(64),
    applied: [{ key, offset: 1 }],
  },
];
const delivered = (file = 'corridor.js') =>
  [0, 1].map(() => ({ file, status: 200, sha256: DIGEST[file] }));
function reader() {
  const report = {
    ...base,
    schema: 'vh-reader-doors/1',
    engine: 'chromium',
    browserVersion: '1',
    pageErrors: [],
    d1Day: READER_D1_DAY,
    results: READER_CASES.map((id) =>
      [1728, 390].some((width) => id === shelf(width))
        ? { id, pass: true, observed: { day: READER_D1_DAY, count: READER_D1_PICKS } }
        : { id, pass: true },
    ),
    controls: [],
  };
  for (const [name, spec] of Object.entries(READER_CONTROLS)) {
    const rows = READER_RUN_ROWS[spec.run].map((id) => ({ id, pass: !spec.kills.includes(id) }));
    const set = (id, observed) => {
      rows.find((row) => row.id === id).observed = observed;
    };
    if (name.startsWith('escape-'))
      for (const f of [1, 0])
        set(
          `D2.f${f}.${name === 'escape-leaves-popup-open' ? 'popup-absent' : 'focus-returns'}`,
          triplet({
            premise: { inside: true, source: false, connected: true },
            back: name === 'escape-leaves-popup-open',
            popupGone: name !== 'escape-leaves-popup-open',
            popupPresent: name === 'escape-leaves-popup-open',
            onDuplicate: name === 'escape-focuses-other-occurrence',
          }),
        );
    if (name.startsWith('inline-english-')) set(spec.kills[0], { glosses: ['VH_INLINE_ENGLISH'] });
    if (name === 'inline-english-named-d4') {
      set('D4.tap-shows', { view: { gloss: 'VH_INLINE_ENGLISH' } });
      set('D4.own-english', { glosses: ['VH_INLINE_ENGLISH', 'valley', 'valley'] });
    }
    if (name === 'g3-stalled') set(spec.kills[0], { popup: null });
    if (name === 'g3-kept-reading')
      for (const kill of spec.kills)
        set(
          kill,
          Array.from({ length: 3 }, () => ({ visibleRuby: 'たにがわ' })),
        );
    if (name === 'g3-off-hidden') {
      set('D2.f0.visible-reading', Array(3).fill(''));
      set('D2.f0.english-rung', {
        englishes: Array.from({ length: 3 }, () => ({ visibleRuby: '' })),
      });
    }
    if (name === 'm8') for (const id of spec.kills) set(id, { mini: null });
    if (name === 'r1')
      for (const f of [1, 0]) {
        set(`D2.f${f}.visible-reading`, Array(3).fill('たにかわ'));
        set(
          `D2.f${f}.popup-reading`,
          Array.from({ length: 3 }, () => ({ reading: 'たにかわ' })),
        );
        set(
          `D2.f${f}.accessible-reading`,
          Array.from({ length: 3 }, () => ({
            description: 'たにかわ · Enter: next word layer · Shift+F10: save and more',
          })),
        );
      }
    const mutation = served(
      spec.key,
      name === 'r1' ? 'data/articles/aozora-046605.json' : 'corridor.js',
    );
    report.controls.push({
      name,
      run: spec.run,
      verdict: 'killed',
      rows,
      pageErrors: [],
      served: mutation,
      restore: {
        passed: true,
        error: null,
        pageErrors: [],
        rows: READER_RUN_ROWS[spec.run].map((id) => ({ id, pass: true })),
        delivered: delivered(mutation[0].file),
      },
    });
  }
  return report;
}
const recordRows = (cases = Object.keys(RECORD_ROWS)) =>
  cases.flatMap((name) => RECORD_ROWS[name].map((id) => ({ id: `chromium/${id}`, ok: true })));
function record(engines = ['chromium']) {
  const files = new Map();
  const at = (engine, label) => `/gate/record-depth/${engine}-${label}-Ab12Cd`;
  const rowsFor = (engine, cases) =>
    recordRows(cases).map((row) => ({ ...row, id: row.id.replace(/^chromium\//u, `${engine}/`) }));
  const report = {
    ...base,
    schema: 'vh-record-depth/1',
    phase: 'controls-parent',
    scope: 'full-engine',
    selectors: { controls: true, only: null, control: null },
    engines,
    browsers: Object.fromEntries(engines.map((engine) => [engine, '1'])),
    rows: engines.flatMap((engine) => rowsFor(engine)),
    controls: [],
  };
  const receipt = (engine, name, phase, spec) => ({
    ...base,
    nonce: `${engine}-${name}-${phase}`,
    fullAcceptance: false,
    engines: [engine],
    browsers: { [engine]: '1' },
    selectors: {
      controls: false,
      only: phase === 'candidate' ? null : [spec.case],
      control: phase === 'mutant' ? name : null,
    },
    rows: rowsFor(engine, phase === 'candidate' ? undefined : [spec.case]),
    ...(phase === 'mutant' ? {} : { delivered: delivered(), deliveryError: null }),
  });
  const child = (dir, receipt, code) => {
    files.set(`${dir}/verify-record-depth.json`, clone(receipt));
    return { dir, valid: true, status: { code, signal: null, timedOut: false }, receipt };
  };
  for (const engine of engines) {
    const candidate = child(at(engine, 'candidate'), receipt(engine, 'all', 'candidate'), 3);
    for (const [name, spec] of Object.entries(RECORD_CONTROLS)) {
      const mutant = receipt(engine, name, 'mutant', spec),
        restore = receipt(engine, name, 'restore', spec);
      const red = mutant.rows.find((row) => row.id === `${engine}/${spec.kill}`);
      red.ok = false;
      red.observed =
        name === 'kagami-spelling-only'
          ? { rowReading: 'ねん', mirror: { toshi: true } }
          : { head: '訳', reading: 'やく', tutor: true, page: 'STALE_WAKE_REASON' };
      mutant.control = { served: served(name === 'kagami-spelling-only' ? 'door' : 'ref') };
      report.controls.push({
        name,
        engine,
        verdict: 'killed',
        candidate: clone(candidate),
        mutant: child(at(engine, name), mutant, 1),
        restore: child(at(engine, `${name}-restore`), restore, 3),
      });
    }
  }
  const readReport = (path) => {
    if (!files.has(path)) throw new Error(`Required receipt missing: ${path}`);
    return clone(files.get(path));
  };
  return {
    report,
    files,
    context: { ...context, engine: engines.length > 1 ? 'all' : engines[0], readReport },
  };
}
function delivery(engines = ['chromium', 'webkit']) {
  const report = {
    ...base,
    schema: 'vh-report-delivery/1',
    scope: 'full-engine',
    engines,
    browsers: Object.fromEntries(engines.map((engine) => [engine, '1'])),
    checks: expectedReportChecks(engines).map((name) => ({ name, pass: true })),
    scenarios: engines.flatMap((engine) =>
      [
        'copy en',
        'copy ja',
        'prefilled issue',
        'long report',
        'blocked window',
        'relay',
        'no Blob storage',
        'relay answering late',
        'setup link',
      ].map((name) => ({ name: `${engine} · ${name}`, completed: true })),
    ),
    controls: [],
  };
  for (const engine of engines)
    for (const locale of ['en', 'ja'])
      for (const name of REPORT_COPY_CONTROLS) {
        const pending = name === 'fallback-advertised-before-probe',
          label = pending ? 'Send report' : locale === 'ja' ? '送る' : 'Send';
        let before = {
            observed: {
              visible: label,
              accessible: label,
              visibleShown: true,
              delivery: pending ? 'service' : 'github',
              disabled: false,
            },
          },
          mutant = clone(before);
        if (name === 'fallback-copy-empty') mutant.observed.visible = '';
        if (name === 'fallback-copy-wrong') mutant.observed.visible = 'Wrong send label';
        if (!pending && name !== 'public-disclosure-removed')
          mutant.observed.accessible = '[accessible name mismatch]';
        if (pending) mutant.observed.delivery = 'github';
        if (name === 'public-disclosure-removed') {
          before = {
            observed: {
              expected: PUBLIC_DISCLOSURE[locale],
              pass: true,
              text: PUBLIC_DISCLOSURE[locale],
            },
          };
          mutant = {
            observed: { expected: PUBLIC_DISCLOSURE[locale], pass: false, text: 'Details' },
          };
        }
        report.controls.push({
          engine,
          locale,
          name,
          verdict: 'killed',
          error: null,
          before,
          mutant,
          restored: clone(before),
        });
      }
  return report;
}
const fixtures = {
  'reader-doors': () => ({ report: reader(), context }),
  'record-depth': record,
  'report-delivery': () => ({ report: delivery(), context: deliveryContext }),
};
for (const [kind, fixture] of Object.entries(fixtures)) {
  const adapter = learningReportContracts[kind];
  test(`${kind}: accepts exact completed candidate and rejects every individual omitted row/control`, () => {
    const { report, context } = fixture();
    assert.deepEqual(adapter.validate(report, context).errors, []);
    const key = kind === 'reader-doors' ? 'results' : kind === 'record-depth' ? 'rows' : 'checks';
    for (let i = 0; i < report[key].length; i++) {
      const bad = clone(report);
      bad[key].splice(i, 1);
      assert.equal(adapter.validate(bad, context).passed, false, `omitted row ${i}`);
    }
    for (let i = 0; i < report.controls.length; i++) {
      const bad = clone(report);
      bad.controls.splice(i, 1);
      assert.equal(adapter.validate(bad, context).passed, false, `omitted control ${i}`);
    }
    for (const mutate of [
      (x) => x[key].push(clone(x[key][0])),
      (x) => (x.fullAcceptance = false),
      (x) => (x.runId = 'stale'),
      (x) => (x.gitSha = '0'.repeat(40)),
      (x) => (x.artifactSha256 = '0'.repeat(64)),
      (x) => (x.verifierSha256 = '0'.repeat(64)),
    ]) {
      const bad = clone(report);
      mutate(bad);
      assert.equal(adapter.validate(bad, context).passed, false);
    }
  });
}
test('reader exact Escape witness, unrelated red, clean restore bytes, and engine coverage are mandatory', () => {
  for (const mutate of [
    (x) => (x.controls[0].rows.find((r) => !r.pass).observed[0].premise.inside = false),
    (x) => (x.controls[1].rows.find((r) => !r.pass).observed[0].onDuplicate = false),
    (x) => (x.controls[2].rows.find((r) => !r.pass).observed[0].popupPresent = false),
    (x) => (x.controls[0].rows[0].pass = false),
    (x) => x.controls[0].restore.rows.pop(),
    (x) => delete x.controls[0].restore.delivered,
    (x) => (x.controls[0].restore.delivered[0].sha256 = 'f'.repeat(64)),
    (x) => (x.controls[0].error = 'timeout'),
    (x) => (x.controls[0].served[0].mutantSha256 = x.controls[0].served[0].baseSha256),
  ]) {
    const bad = reader();
    mutate(bad);
    assert.equal(learningReportContracts['reader-doors'].validate(bad, context).passed, false);
  }
  assert.equal(
    learningReportContracts['reader-doors-webkit'].validate(reader(), context).passed,
    false,
  );
});
test('reader intended failures must be exact false, never missing, null, skip or truthy stand-ins', () => {
  for (const name of Object.keys(READER_CONTROLS))
    for (const value of [undefined, null, 'skip', 0, 1, 'false']) {
      const bad = reader(),
        row = bad.controls
          .find((control) => control.name === name)
          .rows.find((row) => row.pass === false);
      if (value === undefined) delete row.pass;
      else row.pass = value;
      assert.equal(
        learningReportContracts['reader-doors'].validate(bad, context).passed,
        false,
        `${name}/${String(value)}`,
      );
    }
});
const executionMarkers = [
  { skipped: true },
  { skip: true },
  { unexecuted: true },
  { timedOut: true },
  { harnessError: 'setup did not complete' },
  { error: 'observation failed' },
  { status: 'not-run' },
];
test('reader execution markers reject in control, mutant row, array observation and restored evidence', () => {
  for (const marker of executionMarkers)
    for (const location of [
      'control',
      'row',
      'observation',
      'restore',
      'restore-row',
      'restore-observation',
      'candidate',
    ]) {
      const bad = reader(),
        control = bad.controls[0],
        row = control.rows.find((row) => row.pass === false);
      const target =
        location === 'control'
          ? control
          : location === 'row'
            ? row
            : location === 'observation'
              ? row.observed[0]
              : location === 'restore'
                ? control.restore
                : location === 'restore-row'
                  ? control.restore.rows[0]
                  : location === 'restore-observation'
                    ? (control.restore.rows[0].observed = {})
                    : bad.results[0];
      Object.assign(target, marker);
      assert.equal(
        learningReportContracts['reader-doors'].validate(bad, context).passed,
        false,
        `${location}/${JSON.stringify(marker)}`,
      );
    }
});
const childFile = (r, index, phase) =>
  `${r.report.controls[index][phase].dir}/verify-record-depth.json`;
const onBoth = (r, phase, index, change) => {
  for (const control of phase === 'candidate' ? r.report.controls : [r.report.controls[index]])
    change(control[phase].receipt);
  change(r.files.get(childFile(r, index, phase)));
};
const judgeRecord = (r) => learningReportContracts['record-depth'].validate(r.report, r.context);
test('record admission keeps its independent17 rows when the producer helper loses a row', () => {
  const removed = RECORD_ROWS.A.pop();
  try {
    const narrowed = record();
    assert.equal(narrowed.report.rows.length, 16);
    assert.equal(learningReportContracts['record-depth'].expectedCases('chromium').length, 17);
    assert.equal(judgeRecord(narrowed).passed, false);
  } finally {
    RECORD_ROWS.A.push(removed);
  }
  assert.equal(judgeRecord(record()).passed, true);
});
test('record admission requires strict boolean observations in candidate, mutant and restore', () => {
  for (const badValue of [undefined, null, 0, 1, 'true', 'false']) {
    const parent = record();
    parent.report.rows[0].ok = badValue;
    assert.equal(judgeRecord(parent).passed, false);
    for (const phase of ['candidate', 'restore']) {
      const child = record();
      onBoth(child, phase, 0, (receipt) => (receipt.rows[0].ok = badValue));
      assert.equal(judgeRecord(child).passed, false, phase);
    }
    const mutant = record();
    onBoth(mutant, 'mutant', 0, (receipt) => {
      receipt.rows.find((row) => row.ok === false).ok = badValue;
    });
    assert.equal(
      judgeRecord(mutant).passed,
      false,
      'a missing/truthy marker is not a named false witness',
    );
  }
});
test('record intended witnesses and all phases reject execution markers even with exact boolean verdicts', () => {
  for (const index of [0, 1])
    for (const phase of ['candidate', 'mutant', 'restore'])
      for (const marker of executionMarkers) {
        for (const location of ['receipt', 'row', 'observation', 'child']) {
          const bad = record();
          if (location === 'child') Object.assign(bad.report.controls[index][phase], marker);
          else {
            onBoth(bad, phase, index, (receipt) => {
              const row =
                phase === 'mutant' ? receipt.rows.find((row) => row.ok === false) : receipt.rows[0];
              Object.assign(
                location === 'receipt' ? receipt : location === 'row' ? row : (row.observed ||= {}),
                marker,
              );
            });
            // Preserve parent/candidate equality so a content-binding mismatch cannot hide this regression.
            if (phase === 'candidate')
              bad.report.rows = clone(bad.report.controls[index].candidate.receipt.rows);
          }
          assert.equal(
            judgeRecord(bad).passed,
            false,
            `${index}/${phase}/${location}/${JSON.stringify(marker)}`,
          );
        }
      }
});
test('record raw full run, filtered candidate, setup failures and false claimed kills cannot be accepted', () => {
  for (const mutate of [
    (r) => (r.report.phase = 'candidate'),
    (r) => (r.report.selectors.controls = false),
    (r) => onBoth(r, 'candidate', 0, (x) => (x.selectors.only = ['R'])),
    (r) => (r.report.controls[0].mutant.status.code = 0),
    (r) => (r.report.controls[0].mutant.status.timedOut = true),
    (r) => onBoth(r, 'mutant', 0, (x) => (x.control.setupError = 'failed edit')),
    (r) => onBoth(r, 'mutant', 0, (x) => (x.rows.find((row) => !row.ok).observed = {})),
    (r) => onBoth(r, 'restore', 0, (x) => (x.rows[0].ok = false)),
    (r) => onBoth(r, 'mutant', 0, (x) => (x.nonce = r.report.controls[0].restore.receipt.nonce)),
    (r) => onBoth(r, 'mutant', 1, (x) => (x.nonce = r.report.controls[0].mutant.receipt.nonce)),
    (r) => onBoth(r, 'mutant', 0, (x) => (x.control.served[0].baseSha256 = '')),
  ]) {
    const r = record();
    mutate(r);
    assert.equal(judgeRecord(r).passed, false);
  }
  const r = record();
  assert.equal(judgeRecord({ ...r, context: { ...r.context, engine: 'all' } }).passed, false);
  const both = record(['chromium', 'webkit']);
  assert.deepEqual(
    learningReportContracts['record-depth-webkit'].validate(both.report, both.context).passed,
    false,
  );
  assert.deepEqual(judgeRecord(both).errors, []);
});
test('record children are re-read fresh from their own attempt directories, never trusted from the parent copy', () => {
  assert.deepEqual(judgeRecord(record()).errors, []);
  for (const [label, mutate] of [
    ['missing mutant receipt', (r) => r.files.delete(childFile(r, 0, 'mutant'))],
    ['missing candidate receipt', (r) => r.files.delete(childFile(r, 0, 'candidate'))],
    ['no fresh reader', (r) => delete r.context.readReport],
    [
      'stale restore refused by the reader',
      (r) => {
        const read = r.context.readReport;
        r.context.readReport = (path) => {
          if (path === childFile(r, 0, 'restore')) throw new Error(`Stale receipt: ${path}`);
          return read(path);
        };
      },
    ],
    ['foreign child run', (r) => onBoth(r, 'restore', 0, (x) => (x.runId = 'other-run'))],
    ['missing child nonce', (r) => onBoth(r, 'mutant', 0, (x) => delete x.nonce)],
    [
      'red disk restore, green parent copy',
      (r) => (r.files.get(childFile(r, 0, 'restore')).rows[0].ok = false),
    ],
    [
      'doctored parent copy of a genuine kill',
      (r) =>
        (r.report.controls[0].mutant.receipt.rows.find((row) => !row.ok).observed = {
          doctored: true,
        }),
    ],
    [
      'restore child error',
      (r) => onBoth(r, 'restore', 0, (x) => (x.terminalError = 'Error: restore failed')),
    ],
    [
      'mutant pointed at the restore attempt',
      (r) => {
        r.report.controls[0].mutant.dir = r.report.controls[0].restore.dir;
        r.report.controls[0].mutant.receipt = clone(r.report.controls[0].restore.receipt);
      },
    ],
    [
      'attempt directory outside the declared naming',
      (r) => {
        const dir = '/gate/record-depth/elsewhere';
        r.files.set(`${dir}/verify-record-depth.json`, r.files.get(childFile(r, 0, 'mutant')));
        r.report.controls[0].mutant.dir = dir;
      },
    ],
    ['parent rows not the candidate rows', (r) => (r.report.rows[0].observed = 'doctored')],
    ['parent version not the candidate version', (r) => (r.report.browsers.chromium = '2')],
  ]) {
    const r = record();
    mutate(r);
    assert.equal(judgeRecord(r).passed, false, label);
  }
});
test('record-depth admission reads fresh child receipts from disk through the real gate consumer', () => {
  const root = fileURLToPath(new globalThis.URL('../..', import.meta.url));
  const producerSha = digest(
    readFileSync(join(root, 'prototypes/corridor/tools/verify-record-depth.mjs')),
  );
  const materialize = (name) => {
    const out = mkdtempSync(join(tmpdir(), `vh-record-depth-${name}-`)),
      gate = join(out, 'record-depth'),
      r = record();
    const moved = new Map();
    for (const control of r.report.controls)
      for (const phase of ['candidate', 'mutant', 'restore']) {
        const child = control[phase],
          from = `${child.dir}/verify-record-depth.json`;
        child.dir = join(gate, child.dir.split('/').at(-1));
        child.receipt.verifierSha256 = producerSha;
        if (!moved.has(from))
          moved.set(from, { ...r.files.get(from), verifierSha256: producerSha });
        mkdirSync(child.dir, { recursive: true });
        writeFileSync(join(child.dir, 'verify-record-depth.json'), JSON.stringify(moved.get(from)));
      }
    r.report.verifierSha256 = producerSha;
    writeFileSync(join(gate, 'verify-record-depth.json'), JSON.stringify(r.report));
    const context = {
      root,
      out,
      engine: 'chromium',
      startedAt: new Date(Date.now() - 1000).toISOString(),
      runId: base.runId,
      gitSha: base.gitSha,
      artifactSha256: base.artifactSha256,
      verifierSha256: producerSha,
      runtimeFiles,
      stdoutPath: join(out, 'record-depth.stdout.json'),
    };
    const admit = () =>
      validateGateEvidence(
        { name: 'record-depth', args: ['--controls'] },
        { kind: 'adapter', name: 'record-depth' },
        context,
      );
    return { out, report: r.report, admit };
  };
  const good = materialize('good');
  try {
    const admitted = good.admit();
    assert.equal(admitted.obligation.observedCases.length, 17);
    assert(admitted.receipts.length > 1);
  } finally {
    rmSync(good.out, { recursive: true, force: true });
  }
  for (const [label, mutate, pattern] of [
    [
      'stale child',
      (x) =>
        utimesSync(
          join(x.report.controls[0].restore.dir, 'verify-record-depth.json'),
          new Date(0),
          new Date(0),
        ),
      /Stale receipt/u,
    ],
    [
      'missing child',
      (x) => rmSync(join(x.report.controls[1].mutant.dir, 'verify-record-depth.json')),
      /mutant: fresh child receipt unreadable: ENOENT/u,
    ],
    [
      'foreign child nonce',
      (x) => {
        const file = join(x.report.controls[0].mutant.dir, 'verify-record-depth.json');
        writeFileSync(
          file,
          JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), runId: 'other' }),
        );
      },
      /run nonce differs/u,
    ],
    [
      'embedded copy differs from disk',
      (x) => {
        const file = join(x.report.controls[0].restore.dir, 'verify-record-depth.json');
        const child = JSON.parse(readFileSync(file, 'utf8'));
        child.rows[0].ok = false;
        writeFileSync(file, JSON.stringify(child));
      },
      /embedded child differs/u,
    ],
  ]) {
    const x = materialize(label.replaceAll(' ', '-'));
    try {
      mutate(x);
      assert.throws(() => x.admit(), pattern, label);
    } finally {
      rmSync(x.out, { recursive: true, force: true });
    }
  }
});
test('reader D1 is judged at the declared shelf day with exactly six picks per width', () => {
  assert.deepEqual(learningReportContracts['reader-doors'].validate(reader(), context).errors, []);
  for (const mutate of [
    (x) => (x.d1Day = '2026-10-16'),
    (x) => delete x.d1Day,
    (x) => (x.results.find((r) => r.id === shelf(390)).observed.day = '2026-10-16'),
    (x) => (x.results.find((r) => r.id === shelf(1728)).observed.count = 5),
    (x) => delete x.results.find((r) => r.id === shelf(1728)).observed,
    (x) => {
      x.results = x.results.filter((r) => !/^D1 390 pick 6:/u.test(r.id));
      x.results.find((r) => r.id === shelf(390)).observed.count = 5;
    },
  ]) {
    const bad = reader();
    mutate(bad);
    assert.equal(learningReportContracts['reader-doors'].validate(bad, context).passed, false);
  }
});
test('report delivery is pinned to both engines independently of the declared gate engine', () => {
  const adapter = learningReportContracts['report-delivery'];
  assert.deepEqual(adapter.validate(delivery(), deliveryContext).errors, []);
  assert.deepEqual(adapter.expectedCases('chromium'), adapter.expectedCases('all'));
  for (const engine of ['chromium', 'webkit']) {
    assert.equal(adapter.validate(delivery([engine]), { ...context, engine }).passed, false);
    assert.equal(adapter.validate(delivery([engine]), deliveryContext).passed, false);
    assert.equal(adapter.validate(delivery(), { ...context, engine }).passed, false);
  }
  const unversioned = delivery();
  delete unversioned.browsers.webkit;
  assert.equal(adapter.validate(unversioned, deliveryContext).passed, false);
  const diagnostic = delivery();
  diagnostic.scope = 'diagnostic';
  assert.equal(adapter.validate(diagnostic, deliveryContext).passed, false);
  assert.equal(learningReportContracts['report-delivery-chromium'], undefined);
});
test('report claims are re-adjudicated from exact copy/disclosure observations and complete scenarios', () => {
  for (const mutate of [
    (x) => (x.controls[0].before.observed.visible = ''),
    (x) => (x.controls[0].restored.observed.accessible = 'wrong'),
    (x) => (x.controls[0].mutant = clone(x.controls[0].before)),
    (x) => (x.controls[0].mutant.observed.disabled = true),
    (x) => (x.controls[4].restored.observed.text = 'public someday'),
    (x) => (x.controls[4].restored.observed.expected = 'public someday'),
    (x) => x.scenarios.pop(),
    (x) => (x.scenarios[0].completed = false),
  ]) {
    const bad = delivery();
    mutate(bad);
    assert.equal(
      learningReportContracts['report-delivery'].validate(bad, deliveryContext).passed,
      false,
    );
  }
});
const controlAt = (x, name, locale = 'en', engine = 'chromium') =>
  x.controls.find((c) => c.engine === engine && c.locale === locale && c.name === name);
const judgeDelivery = (x, ctx = deliveryContext) =>
  learningReportContracts['report-delivery'].validate(x, ctx);
test('public disclosure removal is a kill only with complete before, mutant and restored observations', () => {
  assert.deepEqual(judgeDelivery(delivery()).errors, []);
  const pub = (x, locale) => controlAt(x, 'public-disclosure-removed', locale);
  for (const [label, mutate] of [
    ['absent mutant', (x) => delete pub(x).mutant],
    ['mutant without an observation', (x) => (pub(x).mutant = {})],
    ['null observation', (x) => (pub(x).mutant.observed = null)],
    ['null pass marker', (x) => (pub(x).mutant.observed.pass = null)],
    ['undefined pass marker', (x) => delete pub(x).mutant.observed.pass],
    ['string pass marker', (x) => (pub(x).mutant.observed.pass = 'false')],
    ['skip marker', (x) => (pub(x).mutant.observed = { skipped: true })],
    [
      'wrong expected text while the disclosure is still shown',
      (x) =>
        Object.assign(pub(x).mutant.observed, {
          expected: 'Something else',
          text: `Details\n${PUBLIC_DISCLOSURE.en}`,
        }),
    ],
    [
      'expected text of the other locale',
      (x) => (pub(x, 'ja').mutant.observed.expected = PUBLIC_DISCLOSURE.en),
    ],
    [
      'pass false but the disclosure is still in the text',
      (x) => (pub(x).mutant.observed.text = `Details\n\n${PUBLIC_DISCLOSURE.en}`),
    ],
    ['empty mutant text', (x) => (pub(x).mutant.observed.text = '')],
    ['missing mutant text', (x) => delete pub(x).mutant.observed.text],
    ['error marker', (x) => (pub(x).error = 'Error: timeout')],
    ['undefined error field', (x) => delete pub(x).error],
    ['incomplete verdict', (x) => (pub(x).verdict = 'incomplete')],
    ['restored observation absent', (x) => delete pub(x).restored],
    ['before pass null', (x) => (pub(x).before.observed.pass = null)],
    ['before text lacks the disclosure', (x) => (pub(x).before.observed.text = 'Details')],
    ['restored expected text wrong', (x) => (pub(x).restored.observed.expected = 'Details')],
  ]) {
    const bad = delivery();
    mutate(bad);
    assert.equal(judgeDelivery(bad).passed, false, label);
  }
});
test('copy-label kills require complete observations and each control’s own fault witness', () => {
  for (const [label, mutate] of [
    [
      'missing visibleShown',
      (x) => delete controlAt(x, 'fallback-copy-empty').mutant.observed.visibleShown,
    ],
    [
      'missing visible copy',
      (x) => delete controlAt(x, 'fallback-copy-wrong').mutant.observed.visible,
    ],
    [
      'missing accessible name',
      (x) => delete controlAt(x, 'fallback-accessible-name-wrong').mutant.observed.accessible,
    ],
    [
      'missing delivery on the delivery kill',
      (x) => delete controlAt(x, 'fallback-advertised-before-probe').mutant.observed.delivery,
    ],
    [
      'null disabled',
      (x) => (controlAt(x, 'fallback-copy-empty', 'ja').mutant.observed.disabled = null),
    ],
    [
      'skip marker',
      (x) => (controlAt(x, 'fallback-copy-wrong').mutant.observed = { skipped: true }),
    ],
    ['absent mutant', (x) => delete controlAt(x, 'fallback-accessible-name-wrong').mutant],
    [
      'empty-copy kill without empty copy',
      (x) => (controlAt(x, 'fallback-copy-empty').mutant.observed.visible = 'Something'),
    ],
    [
      'wrong-copy kill from a hidden button',
      (x) =>
        Object.assign(controlAt(x, 'fallback-copy-wrong').mutant.observed, {
          visible: 'Send',
          accessible: 'Send',
          visibleShown: false,
        }),
    ],
    [
      'accessible-name kill caused by the visible copy',
      (x) => (controlAt(x, 'fallback-accessible-name-wrong').mutant.observed.visible = ''),
    ],
    [
      'pending kill with the service still advertised',
      (x) =>
        Object.assign(controlAt(x, 'fallback-advertised-before-probe').mutant.observed, {
          delivery: 'relay',
        }),
    ],
    [
      'before observation incomplete',
      (x) => delete controlAt(x, 'fallback-copy-empty').before.observed.disabled,
    ],
    ['restored observation absent', (x) => delete controlAt(x, 'fallback-copy-wrong').restored],
    ['unknown locale', (x) => (controlAt(x, 'fallback-copy-empty').locale = 'fr')],
  ]) {
    const bad = delivery();
    mutate(bad);
    assert.equal(judgeDelivery(bad).passed, false, label);
  }
});
test('public disclosure and every copy kill reject execution-failure markers in every phase and observation', () => {
  for (const name of REPORT_COPY_CONTROLS)
    for (const phase of ['before', 'mutant', 'restored'])
      for (const location of ['control', 'phase', 'observation'])
        for (const marker of executionMarkers) {
          const bad = delivery(),
            control = controlAt(bad, name);
          Object.assign(
            location === 'control'
              ? control
              : location === 'phase'
                ? control[phase]
                : control[phase].observed,
            marker,
          );
          assert.equal(
            judgeDelivery(bad).passed,
            false,
            `${name}/${phase}/${location}/${JSON.stringify(marker)}`,
          );
        }
});
test('the reviewed report-delivery roster is the current producer schedule, held independently of it', () => {
  const adapter = learningReportContracts['report-delivery'];
  assert.deepEqual(adapter.expectedCases('all'), expectedReportChecks(['chromium', 'webkit']));
  // INT-VH (2026-10-19): + Hfix-1B's six H0-4 rows per engine (107 → 119)
  assert.equal(adapter.expectedCases('all').length, 119);
  assert.deepEqual(Object.keys(REPORT_COPY_CONTROL_SPECS), [...REPORT_COPY_CONTROLS]);
});
test('a mutated producer schedule or comparator cannot shrink or loosen learning admission', async () => {
  const output = process.env.RUNNER_TEMP || join(homedir(), '.dharma', 'bunki', 'test-fixtures');
  mkdirSync(output, { recursive: true });
  const root = mkdtempSync(join(output, 'learning-oracle-'));
  try {
    const ci = join(root, 'scripts', 'ci'),
      tools = join(root, 'prototypes', 'corridor', 'tools');
    mkdirSync(ci, { recursive: true });
    mkdirSync(tools, { recursive: true });
    for (const name of ['vh-learning-report-contracts.mjs', 'vh-learning-rosters.mjs'])
      writeFileSync(join(ci, name), readFileSync(new globalThis.URL(name, import.meta.url)));
    const original = JSON.stringify(
      new globalThis.URL(
        '../../prototypes/corridor/tools/vh-learning-contracts.mjs',
        import.meta.url,
      ).href,
    );
    writeFileSync(
      join(tools, 'vh-learning-contracts.mjs'),
      [
        `import * as original from ${original};`,
        `export * from ${original};`,
        `export const REPORT_COPY_CONTROLS = Object.freeze(original.REPORT_COPY_CONTROLS.filter((name) => name !== 'public-disclosure-removed'));`,
        `export function expectedReportChecks(engines) { return original.expectedReportChecks(engines).filter((name) => !name.endsWith(' · no console errors (relay)') && !name.endsWith('/C.public-disclosure-removed')); }`,
        `export function reportCopyObservation() { return { label: true, delivery: true, enabled: true }; }`,
        `export function exactNamedCompletion() { return true; }`,
        `export const RECORD_ROWS = Object.freeze({ ...original.RECORD_ROWS, A: original.RECORD_ROWS.A.slice(1) });`,
        '',
      ].join('\n'),
    );
    const producer = await import(pathToFileURL(join(tools, 'vh-learning-contracts.mjs')).href);
    const shrunkChecks = producer.expectedReportChecks(['chromium', 'webkit']);
    assert.equal(shrunkChecks.length, 113);
    assert.equal(producer.REPORT_COPY_CONTROLS.length, 4);
    assert.deepEqual(producer.reportCopyObservation({}), {
      label: true,
      delivery: true,
      enabled: true,
    });
    assert.equal(producer.exactNamedCompletion([], ['x']), true);
    assert.equal(Object.values(producer.RECORD_ROWS).flat().length, 16);
    const altered = await import(pathToFileURL(join(ci, 'vh-learning-report-contracts.mjs')).href);
    const adapter = altered.learningReportContracts['report-delivery'];
    assert.equal(adapter.expectedCases('all').length, 119);
    assert.equal(
      altered.learningReportContracts['record-depth'].expectedCases('chromium').length,
      17,
    );
    assert.deepEqual(adapter.validate(delivery(), deliveryContext).errors, []);
    const fromProducer = () => {
      const x = delivery();
      x.checks = shrunkChecks.map((name) => ({ name, pass: true }));
      x.controls = x.controls.filter((c) => producer.REPORT_COPY_CONTROLS.includes(c.name));
      return x;
    };
    assert.equal(adapter.validate(fromProducer(), deliveryContext).passed, false);
    const fewerChecks = delivery();
    fewerChecks.checks = fromProducer().checks;
    assert.equal(adapter.validate(fewerChecks, deliveryContext).passed, false);
    const fewerControls = delivery();
    fewerControls.controls = fromProducer().controls;
    assert.equal(adapter.validate(fewerControls, deliveryContext).passed, false);
    for (const mutate of [
      (x) => (controlAt(x, 'fallback-copy-empty').restored.observed.accessible = 'wrong'),
      (x) => (controlAt(x, 'fallback-copy-wrong').before.observed = {}),
      (x) =>
        (controlAt(x, 'fallback-advertised-before-probe').restored.observed.delivery = 'github'),
    ]) {
      const bad = delivery();
      mutate(bad);
      assert.equal(adapter.validate(bad, deliveryContext).passed, false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('reader served bases and restored loads are bound to the tested artifact manifest, never to each other', () => {
  const adapter = learningReportContracts['reader-doors'];
  assert.deepEqual(adapter.validate(reader(), context).errors, []);
  assert.deepEqual(adapter.validate(reader(), { ...context, runtimeFiles: DIGEST }).errors, []);
  const without = (path) => ({
    ...context,
    runtimeFiles: runtimeFiles.filter((row) => row.path !== path),
  });
  for (const [label, mutate, ctx = context] of [
    [
      'foreign base and restore digests that agree with each other',
      (x) => {
        for (const c of x.controls) {
          for (const row of c.served) row.baseSha256 = FOREIGN;
          for (const row of c.restore.delivered) row.sha256 = FOREIGN;
        }
      },
    ],
    ['one foreign served base', (x) => (x.controls[0].served[0].baseSha256 = FOREIGN)],
    [
      'restored page loaded a foreign build',
      (x) => (x.controls[0].restore.delivered[0].sha256 = FOREIGN),
    ],
    [
      'restored page loaded the mutant bytes',
      (x) => (x.controls[0].restore.delivered[1].sha256 = x.controls[0].served[0].mutantSha256),
    ],
    ['restored page loaded nothing', (x) => (x.controls[0].restore.delivered = [])],
    [
      'server-only restore probe in place of page loads',
      (x) => {
        const c = x.controls[0];
        delete c.restore.delivered;
        c.restore.served = [{ file: 'corridor.js', sha256: DIGEST['corridor.js'] }];
      },
    ],
    ['failed restore delivery', (x) => (x.controls[0].restore.delivered[0].error = 'aborted')],
    ['non-200 restore delivery', (x) => (x.controls[0].restore.delivered[0].status = 304)],
    ['missing restore status', (x) => delete x.controls[0].restore.delivered[0].status],
    [
      'restore delivery of another file',
      (x) =>
        x.controls[0].restore.delivered.push({
          file: 'speak.js',
          status: 200,
          sha256: DIGEST['corridor.js'],
        }),
    ],
    [
      'r1 base is the corridor digest',
      (x) => (x.controls.find((c) => c.name === 'r1').served[0].baseSha256 = DIGEST['corridor.js']),
    ],
    ['manifest lacks corridor.js', () => {}, without('corridor.js')],
    ['manifest lacks the r1 article', () => {}, without('data/articles/aozora-046605.json')],
    ['no tested artifact manifest', () => {}, { ...context, runtimeFiles: undefined }],
    [
      'manifest digest malformed on both sides',
      (x) => {
        for (const c of x.controls) {
          for (const row of c.served) row.baseSha256 = 'nope';
          for (const row of c.restore.delivered) row.sha256 = 'nope';
        }
      },
      { ...context, runtimeFiles: { ...DIGEST, 'corridor.js': 'nope' } },
    ],
  ]) {
    const bad = reader();
    mutate(bad);
    assert.equal(adapter.validate(bad, ctx).passed, false, label);
  }
});
test('record served base and candidate/restore page loads are bound to the tested artifact manifest', () => {
  assert.deepEqual(judgeRecord(record()).errors, []);
  const both = record(['chromium', 'webkit']);
  assert.deepEqual(judgeRecord(both).errors, []);
  for (const [label, mutate] of [
    [
      'foreign digests that agree with each other',
      (r) => {
        onBoth(r, 'candidate', 0, (x) => x.delivered.forEach((row) => (row.sha256 = FOREIGN)));
        for (const index of [0, 1]) {
          onBoth(r, 'mutant', index, (x) =>
            x.control.served.forEach((row) => (row.baseSha256 = FOREIGN)),
          );
          onBoth(r, 'restore', index, (x) => x.delivered.forEach((row) => (row.sha256 = FOREIGN)));
        }
      },
    ],
    [
      'foreign mutant base',
      (r) => onBoth(r, 'mutant', 0, (x) => (x.control.served[0].baseSha256 = FOREIGN)),
    ],
    [
      'restore loaded a foreign build',
      (r) => onBoth(r, 'restore', 1, (x) => (x.delivered[0].sha256 = FOREIGN)),
    ],
    ['restore loaded nothing', (r) => onBoth(r, 'restore', 0, (x) => (x.delivered = []))],
    ['restore delivery absent', (r) => onBoth(r, 'restore', 0, (x) => delete x.delivered)],
    [
      'restore delivery failed',
      (r) => onBoth(r, 'restore', 0, (x) => (x.delivered[1].error = 'aborted')),
    ],
    [
      'candidate loaded the mutant bytes',
      (r) => onBoth(r, 'candidate', 0, (x) => (x.delivered[0].sha256 = 'e'.repeat(64))),
    ],
    ['candidate delivery absent', (r) => onBoth(r, 'candidate', 0, (x) => delete x.delivered)],
    [
      'manifest lacks corridor.js',
      (r) => (r.context.runtimeFiles = runtimeFiles.filter((row) => row.path !== 'corridor.js')),
    ],
    ['no tested artifact manifest', (r) => delete r.context.runtimeFiles],
  ]) {
    const r = record();
    mutate(r);
    assert.equal(judgeRecord(r).passed, false, label);
  }
});

test('Ladder reader schedule retains all three rungs, off reading and independent VH Escape rows', () => {
  assert.equal(READER_CASES.length, 102);
  assert.equal(Object.keys(READER_CONTROLS).length, 11);
  assert.equal(READER_RUN_ROWS.d2.length, 26);
  assert.equal(READER_RUN_ROWS.d4.length, 11);
  for (const f of [1, 0])
    for (const suffix of [
      'english-rung',
      'reading-no-english',
      'popup-focus-premise',
      'focus-returns',
      'popup-absent',
    ])
      assert.ok(READER_RUN_ROWS.d2.includes(`D2.f${f}.${suffix}`));
  for (const id of [
    'D4.A-english',
    'D4.second-tap-english',
    'D4.third-tap-stage',
    'D4.own-english',
  ])
    assert.ok(READER_RUN_ROWS.d4.includes(id));
});
test('Ladder controls reject vacuous/wrong witnesses, missing off kills, or unrelated mutant reds', () => {
  const adapter = learningReportContracts['reader-doors'];
  const control = (x, n) => x.controls.find((c) => c.name === n);
  const row = (x, n, id) => control(x, n).rows.find((r) => r.id === id);
  for (const mutate of [
    (x) => {
      row(x, 'inline-english-content', 'D4.A-english').observed.glosses = ['this'];
    },
    (x) => {
      row(x, 'inline-english-named-d4', 'D4.tap-shows').observed.view.gloss = null;
    },
    (x) => {
      row(x, 'inline-english-named-d4', 'D4.own-english').observed.glosses = [
        null,
        'valley',
        'valley',
      ];
    },
    (x) => {
      row(x, 'g3-stalled', 'D4.third-tap-stage').observed.popup = { word: '谷川' };
    },
    (x) => {
      row(x, 'g3-kept-reading', 'D2.f0.bare-after-fold').observed = [];
    },
    (x) => {
      row(x, 'g3-off-hidden', 'D2.f0.english-rung').observed.englishes = [];
    },
    (x) => {
      row(x, 'g3-off-hidden', 'D2.f0.accessible-reading').pass = true;
    },
    (x) => {
      row(x, 'r1', 'D2.f0.visible-reading').observed = ['たにがわ', 'たにがわ', 'たにがわ'];
    },
    (x) => {
      row(x, 'r1', 'D2.f0.accessible-reading').observed = [];
    },
    (x) => {
      row(x, 'r1', 'D2.f0.popup-reading').pass = true;
    },
    (x) => {
      row(x, 'r1', 'D2.f1.no-navigation').pass = false;
    },
  ]) {
    const bad = reader();
    mutate(bad);
    assert.equal(adapter.validate(bad, context).passed, false);
  }
  for (const optional of [
    [],
    ['D2.f1.english-rung'],
    ['D2.f0.english-rung'],
    ['D2.f1.english-rung', 'D2.f0.english-rung'],
  ]) {
    const valid = reader();
    for (const id of optional) row(valid, 'r1', id).pass = false;
    assert.deepEqual(adapter.validate(valid, context).errors, []);
  }
});
