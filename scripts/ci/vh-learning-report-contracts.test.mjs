import test from 'node:test';
import assert from 'node:assert/strict';
import {
  learningReportContracts,
  READER_CASES,
  READER_CONTROLS,
  READER_RUN_ROWS,
  PUBLIC_DISCLOSURE,
} from './vh-learning-report-contracts.mjs';
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
const context = { engine: 'chromium', ...base };
const clone = (x) => globalThis.structuredClone(x),
  triplet = (x) => ['tap', 'Enter', 'Space'].map((how) => ({ how, ...x }));
const served = (key) => [
  {
    file: 'corridor.js',
    baseSha256: 'd'.repeat(64),
    mutantSha256: 'e'.repeat(64),
    applied: [{ key, offset: 1 }],
  },
];
function reader() {
  const report = {
    ...base,
    schema: 'vh-reader-doors/1',
    engine: 'chromium',
    browserVersion: '1',
    pageErrors: [],
    results: READER_CASES.map((id) => ({ id, pass: true })),
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
    if (name === 'g3-stalled') set(spec.kills[0], { popup: null });
    if (name === 'g3-kept-reading')
      set(
        spec.kills[0],
        Array.from({ length: 3 }, () => ({ visibleRuby: 'たにがわ' })),
      );
    if (name === 'g3-off-ruby') set(spec.kills[0], Array(3).fill('たにがわ'));
    if (name === 'm8') for (const id of spec.kills) set(id, { mini: null });
    if (name === 'r1') {
      set('D2.f1.visible-reading', Array(3).fill('たにかわ'));
      for (const f of [1, 0])
        set(
          `D2.f${f}.popup-reading`,
          Array.from({ length: 3 }, () => ({ reading: 'たにかわ' })),
        );
      set(
        'D2.f1.accessible-reading',
        Array.from({ length: 3 }, () => ({
          description: 'たにかわ · Enter: next word layer · Shift+F10: save and more',
        })),
      );
    }
    const mutation = served(spec.key);
    if (name === 'r1') mutation[0].file = 'data/articles/aozora-046605.json';
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
        served: [{ file: mutation[0].file, sha256: mutation[0].baseSha256 }],
      },
    });
  }
  return report;
}
const recordRows = (cases = Object.keys(RECORD_ROWS)) =>
  cases.flatMap((name) => RECORD_ROWS[name].map((id) => ({ id: `chromium/${id}`, ok: true })));
function record() {
  const report = {
    ...base,
    schema: 'vh-record-depth/1',
    phase: 'controls-parent',
    scope: 'full-engine',
    selectors: { controls: true, only: null, control: null },
    engines: ['chromium'],
    browsers: { chromium: '1' },
    rows: recordRows(),
    controls: [],
  };
  for (const [name, spec] of Object.entries(RECORD_CONTROLS)) {
    const receipt = (phase) => ({
      ...base,
      runId: `${name}-${phase}`,
      fullAcceptance: false,
      engines: ['chromium'],
      browsers: { chromium: '1' },
      selectors: {
        controls: false,
        only: phase === 'candidate' ? null : [spec.case],
        control: phase === 'mutant' ? name : null,
      },
      rows: recordRows(phase === 'candidate' ? undefined : [spec.case]),
    });
    const candidate = receipt('candidate'),
      mutant = receipt('mutant'),
      restore = receipt('restore');
    const red = mutant.rows.find((row) => row.id === `chromium/${spec.kill}`);
    red.ok = false;
    red.observed =
      name === 'kagami-spelling-only'
        ? { rowReading: 'ねん', mirror: { toshi: true } }
        : { head: '訳', reading: 'やく', tutor: true, page: 'STALE_WAKE_REASON' };
    mutant.control = { served: served(name === 'kagami-spelling-only' ? 'door' : 'ref') };
    const child = (receipt, code) => ({
      valid: true,
      status: { code, signal: null, timedOut: false },
      receipt,
    });
    report.controls.push({
      name,
      engine: 'chromium',
      verdict: 'killed',
      candidate: child(candidate, 3),
      mutant: child(mutant, 1),
      restore: child(restore, 3),
    });
  }
  return report;
}
function delivery() {
  const report = {
    ...base,
    schema: 'vh-report-delivery/1',
    scope: 'full-engine',
    engines: ['chromium'],
    browsers: { chromium: '1' },
    checks: expectedReportChecks(['chromium']).map((name) => ({ name, pass: true })),
    scenarios: [
      'copy en',
      'copy ja',
      'prefilled issue',
      'long report',
      'blocked window',
      'relay',
      'no Blob storage',
      'setup link',
    ].map((name) => ({ name: `chromium · ${name}`, completed: true })),
    controls: [],
  };
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
      if (name === 'fallback-copy-wrong') mutant.observed.visible = 'Send report';
      if (name === 'fallback-accessible-name-wrong') mutant.observed.accessible = 'wrong';
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
        engine: 'chromium',
        locale,
        name,
        verdict: 'killed',
        before,
        mutant,
        restored: clone(before),
      });
    }
  return report;
}
const fixtures = { 'reader-doors': reader, 'record-depth': record, 'report-delivery': delivery };
for (const [kind, fixture] of Object.entries(fixtures)) {
  const adapter = learningReportContracts[kind];
  test(`${kind}: accepts exact completed candidate and rejects every individual omitted row/control`, () => {
    const report = fixture();
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
    (x) => delete x.controls[0].restore.served,
    (x) => (x.controls[0].restore.served[0].sha256 = 'f'.repeat(64)),
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
test('record raw full run, filtered candidate, setup failures and false claimed kills cannot be accepted', () => {
  for (const mutate of [
    (x) => (x.phase = 'candidate'),
    (x) => (x.selectors.controls = false),
    (x) => (x.controls[0].candidate.receipt.selectors.only = ['R']),
    (x) => (x.controls[0].mutant.status.code = 0),
    (x) => (x.controls[0].mutant.status.timedOut = true),
    (x) => (x.controls[0].mutant.receipt.control.setupError = 'failed edit'),
    (x) => (x.controls[0].mutant.receipt.rows.find((r) => !r.ok).observed = {}),
    (x) => (x.controls[0].restore.receipt.rows[0].ok = false),
    (x) => (x.controls[0].mutant.receipt.runId = x.controls[0].restore.receipt.runId),
    (x) => (x.controls[0].mutant.receipt.control.served[0].baseSha256 = ''),
  ]) {
    const bad = record();
    mutate(bad);
    assert.equal(learningReportContracts['record-depth'].validate(bad, context).passed, false);
  }
  assert.equal(
    learningReportContracts['record-depth'].validate(record(), { ...context, engine: 'all' })
      .passed,
    false,
  );
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
    assert.equal(learningReportContracts['report-delivery'].validate(bad, context).passed, false);
  }
});
