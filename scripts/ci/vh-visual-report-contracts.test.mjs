/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  visualReportContracts,
  validateVisualReport,
  SWEEP_ROOMS,
  readingDataIds,
} from './vh-visual-report-contracts.mjs';
import { readFileSync } from 'node:fs';
import { READING_CASES } from '../../prototypes/corridor/tools/vh-visual-contracts.mjs';
const sha = 'a'.repeat(64),
  context = { artifactSha256: sha, verifierSha256: sha, runId: 'attempt-1' };
const observedControls = JSON.parse(
  readFileSync(
    new globalThis.URL(
      '../../prototypes/corridor/tools/vh-visual-observed-controls.json',
      import.meta.url,
    ),
  ),
);
const observedComb = (engine) => structuredClone(observedControls.engines[engine].comb);
const observedShelf = (engine) =>
  observedControls.engines[engine].shelf.map(({ edits, ...row }) => {
    const baseline = [...observedControls.shelves[row.day]],
      changed = [...baseline];
    for (const [at, id] of edits) changed[at] = id;
    return structuredClone({ ...row, baseline, changed, restored: [...baseline] });
  });
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
      report.controls = observedComb(engine);
    } else {
      report.mode = 'verify';
      report.selectors = {};
      report.inventory = ['bi', 'ja'].flatMap((lang) =>
        SWEEP_ROOMS.map((room) => ({ engine, lang, room })),
      );
      report.controls = observedShelf(engine);
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

const shelfRow = (r, id) => r.controls.find((row) => row.id === id);
for (const name of ['sweep', 'sweep-webkit'])
  test(`${name}: shelf controls need actual baseline, mutant and restored observations`, () => {
    const original = candidate(name);
    assert.deepEqual(validateVisualReport(name, original, context).errors, []);
    const forgeries = {
      'the finding example: booleans only, no observations': (r) => {
        const row = r.controls[0];
        r.controls[0] = {
          id: row.id,
          engine: row.engine,
          lang: row.lang,
          day: row.day,
          passed: true,
          premise: { baseGood: true, legacyMembership: true, neighborClean: true },
          restoredBytes: true,
          unrelated: [],
        };
      },
      'baseline and restored both missing': (r) => {
        delete r.controls[0].baseline;
        delete r.controls[0].restored;
      },
      'restored missing': (r) => {
        delete r.controls[0].restored;
      },
      'restored is not the baseline': (r) => {
        const row = r.controls[0];
        [row.restored[0], row.restored[1]] = [row.restored[1], row.restored[0]];
      },
      'mutant equals baseline': (r) => {
        r.controls[0].changed = [...r.controls[0].baseline];
      },
      'mutant moved rows other than its declared pair': (r) => {
        const row = shelfRow(r, 'day-two-drop-order-drift');
        [row.changed[0], row.changed[1]] = [row.changed[1], row.changed[0]];
      },
      'series swap names another pair': (r) => {
        const row = shelfRow(r, 'series-book-order-swapped');
        row.mutation.pair = { a: row.baseline[0], b: row.baseline[1] };
      },
      'intended series witness absent': (r) => {
        const row = shelfRow(r, 'series-book-order-swapped');
        row.judged.series = true;
        row.failures = ['order'];
      },
      'unrelated predicate failed alongside the intended one': (r) => {
        const row = shelfRow(r, 'day-two-drop-order-drift');
        row.judged.roster = false;
        row.failures = ['roster', 'order'];
      },
      'reported failures disagree with the judged predicates': (r) => {
        shelfRow(r, 'drop-duplicate-hides-omission').failures = ['roster', 'blocks'];
      },
      'judged predicates missing': (r) => {
        delete shelfRow(r, 'drop-duplicate-hides-omission').judged;
      },
      'declared intended kill rewritten by the receipt': (r) => {
        shelfRow(r, 'drop-duplicate-hides-omission').mutation.intended = ['order'];
      },
    };
    for (const [label, mutate] of Object.entries(forgeries)) {
      const r = structuredClone(original);
      mutate(r);
      assert.equal(validateVisualReport(name, r, context).passed, false, label);
    }
  });
for (const name of ['comb-0', 'comb-0-webkit'])
  test(`${name}: the lexical control is re-judged from its observed line breaks`, () => {
    const original = candidate(name);
    assert.deepEqual(validateVisualReport(name, original, context).errors, []);
    const forgeries = {
      'candidate and restored missing': (r) => {
        delete r.controls[0].candidate;
        delete r.controls[0].restored;
      },
      'mutant missing': (r) => {
        delete r.controls[0].mutant;
      },
      'mutant is the candidate unchanged': (r) => {
        r.controls[0].mutant = structuredClone(r.controls[0].candidate);
      },
      'mutant has no break, yet the receipt claims the witness': (r) => {
        r.controls[0].mutant.breaks = [];
      },
      'restored html differs from the candidate': (r) => {
        r.controls[0].restored.html = 'サボ<br>る';
      },
      'candidate itself breaks inside the word': (r) => {
        r.controls[0].candidate.breaks = [2];
      },
      'another fixture word': (r) => {
        for (const key of ['candidate', 'mutant', 'restored']) r.controls[0][key].text = 'メモる';
      },
    };
    for (const [label, mutate] of Object.entries(forgeries)) {
      const r = structuredClone(original);
      mutate(r);
      assert.equal(validateVisualReport(name, r, context).passed, false, label);
    }
  });
test('an explicit or declared sweep selector stays diagnostic, even KAIRO_SWEEP_MODE=verify', () => {
  const original = candidate('sweep');
  assert.equal(validateVisualReport('sweep', original, context).passed, true);
  const explicit = structuredClone(original);
  explicit.selectors = { KAIRO_SWEEP_MODE: 'verify' };
  assert.equal(validateVisualReport('sweep', explicit, context).passed, false);
  const unrecorded = structuredClone(original);
  delete unrecorded.selectors;
  assert.equal(validateVisualReport('sweep', unrecorded, context).passed, false);
  for (const name of Object.keys(visualReportContracts)) {
    const report = candidate(name);
    assert.equal(validateVisualReport(name, report, context).passed, true, name);
    for (const env of [{ KAIRO_SWEEP_MODE: 'verify' }, { COMB_NEGATIVE: 'breaks' }])
      assert.equal(
        validateVisualReport(name, report, {
          ...context,
          env: { KAIRO_BROWSER: 'chromium', ...env },
        }).passed,
        false,
        `${name} ${JSON.stringify(env)}`,
      );
  }
});
