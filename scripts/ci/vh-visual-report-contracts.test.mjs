/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  visualReportContracts,
  validateVisualReport,
  SWEEP_ROOMS,
  readingDataIds,
} from './vh-visual-report-contracts.mjs';
import { READING_CASES } from '../../prototypes/corridor/tools/vh-visual-contracts.mjs';
const sha = 'a'.repeat(64),
  context = { artifactSha256: sha, verifierSha256: sha, runId: 'attempt-1' };
function candidate(name) {
  const contract = visualReportContracts[name],
    engine = name.endsWith('-webkit') ? 'webkit' : 'chromium',
    kind = name.replace(/-webkit$/u, '');
  const report = {
    schemaVersion: 2,
    runId: 'attempt-1',
    artifactSha256: sha,
    verifierSha256: sha,
    requestedScope: kind === 'sweep' ? 'verify' : 'full',
    selectedPassed: true,
    fullAcceptance: true,
    engines: [engine],
    browserVersions: { [engine]: '153' },
    complete: true,
    controls: [],
  };
  const ids = contract.expectedCases();
  if (kind === 'design-reader-shelf')
    report.results = ids.map((id) => ({
      engine,
      name: id.slice(id.indexOf('/') + 1),
      passed: true,
    }));
  else if (kind === 'reading-truth') {
    report.rows = ids
      .map((id) => ({ engine, id: id.slice(id.indexOf('/') + 1), ok: true }))
      .concat(readingDataIds.map((id) => ({ engine: 'data', id, ok: true })));
    report.observedCases = READING_CASES.map((id) => `${engine}/${id}`);
    report.versions = report.browserVersions;
    report.rowRoster = { fullAcceptance: true };
    report.failed = 0;
    for (const fixture of ['aozora:000628#76', 'bunki-graded-n3-hashira-counter#242'])
      for (const id of ['special-label-save-enabled', 'special-label-save-reason-empty'])
        report.controls.push({
          engine,
          fixture,
          id,
          passed: true,
          candidate: { held: true },
          restored: { held: true },
          judged: { classification: true, asWritten: true, held: false },
          recordBefore: { v: 1, unknown: 'kept' },
          recordAfter: { v: 1, unknown: 'kept' },
        });
    for (const id of ['class-proof-missing', 'class-proof-noun-substitution'])
      report.controls.push({
        engine,
        id,
        passed: true,
        candidate: { proved: true },
        restored: { proved: true },
        mutant: { proved: false },
      });
    for (const id of ['ordinary-verb-labeled-name', 'ordinary-verb-labeled-reading'])
      report.controls.push({
        engine,
        id,
        passed: true,
        candidate: { ordinary: true },
        restored: { ordinary: true },
        judged: { classification: false, asWritten: true, held: true },
        recordBefore: { v: 1, unknown: 'kept' },
        recordAfter: { v: 1, unknown: 'kept' },
      });
  } else {
    report.checks = ids.map((id) => ({ id, pass: true }));
    if (kind === 'comb-0') {
      report.engines = report.browserVersions;
      for (const lang of ['bi', 'ja'])
        for (const width of [320, 390])
          report.controls.push({
            engine,
            lang,
            width,
            id: 'mixed-script-verb-split',
            passed: true,
            premise: true,
            clean: [],
            back: [],
            wrong: ['inside an independently evidenced mixed-script word'],
            candidate: { html: 'サボる' },
            restored: { html: 'サボる' },
          });
    } else {
      report.mode = 'verify';
      report.inventory = ['bi', 'ja'].flatMap((lang) =>
        SWEEP_ROOMS.map((room) => ({ engine, lang, room })),
      );
      for (const lang of ['bi', 'ja'])
        for (let day = 0; day < 4; day++)
          for (const id of [
            'drop-duplicate-hides-omission',
            'series-book-order-swapped',
            ...(day === 1 ? ['day-two-drop-order-drift'] : []),
          ])
            report.controls.push({
              engine,
              lang,
              day: `2026-10-${19 + day}`,
              id,
              passed: true,
              premise: { baseGood: true, legacyMembership: true, neighborClean: true },
              restoredBytes: true,
              baseline: ['a', 'b'],
              restored: ['a', 'b'],
              unrelated: [],
            });
    }
  }
  return report;
}
for (const name of Object.keys(visualReportContracts))
  test(`${name}: exact full evidence passes; completion/scope/control forgeries fail`, () => {
    const original = candidate(name);
    assert.deepEqual(validateVisualReport(name, original, context).errors, []);
    for (const mutation of [
      (r) => {
        const rows = r.results || r.rows || r.checks;
        rows.pop();
      },
      (r) => {
        const rows = r.results || r.rows || r.checks;
        rows[1] = structuredClone(rows[0]);
      },
      (r) => {
        r.requestedScope = '';
      },
      (r) => {
        r.fullAcceptance = false;
      },
      (r) => {
        r.runId = 'stale';
      },
      (r) => {
        r.artifactSha256 = 'b'.repeat(64);
      },
      (r) => {
        r.engines = ['wrong'];
      },
      (r) => {
        const row = (r.results || r.rows || r.checks)[0];
        row.pass = false;
        row.passed = false;
        row.ok = false;
      },
      ...(name.startsWith('design-')
        ? []
        : [
            (r) => {
              r.controls.pop();
            },
            (r) => {
              r.controls[0].passed = false;
            },
            (r) => {
              r.controls[0].status = 'inconclusive';
              r.controls[0].passed = false;
            },
          ]),
    ]) {
      const r = structuredClone(original);
      mutation(r);
      assert.equal(validateVisualReport(name, r, context).passed, false);
    }
  });
test('unknown producer and empty claimed full report fail closed', () => {
  assert.equal(validateVisualReport('not-a-suite', {}).passed, false);
  for (const name of Object.keys(visualReportContracts))
    assert.equal(
      validateVisualReport(name, {
        fullAcceptance: true,
        selectedPassed: true,
        expectedCases: [],
        observedCases: [],
      }).passed,
      false,
    );
});
test('whole record fields, exact restored shelf and isolated control red are mandatory', () => {
  const reading = candidate('reading-truth');
  delete reading.controls[0].recordAfter.unknown;
  assert.equal(validateVisualReport('reading-truth', reading, context).passed, false);
  const shelf = candidate('sweep');
  shelf.controls[0].restored = ['b', 'a'];
  assert.equal(validateVisualReport('sweep', shelf, context).passed, false);
  const comb = candidate('comb-0');
  comb.controls[0].wrong = ['page crashed'];
  assert.equal(validateVisualReport('comb-0', comb, context).passed, false);
  const mutated = candidate('reading-truth');
  mutated.controls.at(-1).judged.asWritten = false;
  assert.equal(validateVisualReport('reading-truth', mutated, context).passed, false);
});
