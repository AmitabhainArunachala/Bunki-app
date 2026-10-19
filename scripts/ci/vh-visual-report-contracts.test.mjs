/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  visualReportContracts,
  validateVisualReport,
  SWEEP_INVENTORY_ROWS,
  readingDataIds,
} from './vh-visual-report-contracts.mjs';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { URL, pathToFileURL } from 'node:url';
import { READING_CASES, DESIGN_CASES, SWEEP_DROP_IDS } from './vh-visual-rosters.mjs';
import {
  shelfDropOrder,
  shelfDriftControl,
} from '../../prototypes/corridor/tools/vh-visual-contracts.mjs';
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
const OBSERVED_DROP_LENGTH = 40;
const observedDays = Object.keys(observedControls.shelves).sort();
const observedNatural = () =>
  observedDays.map((day) => ({ day, ids: [...observedControls.shelves[day]] }));
const observedShelf = (engine, evaluate) =>
  observedControls.engines[engine].shelf.map(({ edits, ...row }) => {
    const baseline = [...observedControls.shelves[row.day]],
      changed = [...baseline];
    for (const [at, id] of edits) changed[at] = id;
    const observed = structuredClone({ ...row, baseline, changed, restored: [...baseline] });
    return row.id === 'day-two-drop-order-drift'
      ? shelfDriftControl(
          { ...observed, awaiting: 'S09' },
          observedNatural(),
          OBSERVED_DROP_LENGTH,
          evaluate,
        )
      : observed;
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
    report.checks = ids.map((id) =>
      /^S09\//u.test(id)
        ? {
            id,
            pass: true,
            evidence: shelfDropOrder(observedNatural(), OBSERVED_DROP_LENGTH),
          }
        : { id, pass: true },
    );
    if (kind === 'comb-0') {
      report.engines = report.browserVersions;
      report.controls = observedComb(engine);
    } else {
      report.mode = 'verify';
      report.selectors = {};
      report.inventory = ['bi', 'ja'].flatMap((lang) =>
        SWEEP_INVENTORY_ROWS.map((room) => ({ engine, lang, room })),
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
test('the observed four-day shelves share exactly the 40-card adjusted drop and rotate after it', () => {
  const shelves = observedNatural().map(({ ids }) => ids);
  assert.equal(shelves.length, 4);
  const common = shelves[0].findIndex((id, i) => shelves.some((ids) => ids[i] !== id));
  assert.equal(common, OBSERVED_DROP_LENGTH);
  assert(shelves.every((ids) => ids.length > OBSERVED_DROP_LENGTH));
});
test('the reviewed full drop is exactly the canonical accepted hand-chosen content roster', () => {
  const queue = JSON.parse(
    readFileSync(new URL('../../docs/content/feed-review-queue.json', import.meta.url), 'utf8'),
  );
  const eligible = new Set(['original', 'aozora', 'gv', 'mext', 'govonline']);
  const expected = queue
    .filter((row) => eligible.has(row.kind) && row.decision !== 'rejected')
    .map((row) => row.id)
    .sort();
  assert.equal(new Set(expected).size, expected.length);
  assert.deepEqual([...SWEEP_DROP_IDS].sort(), expected);
});
const S09_REJECTION =
  'S09 four-day order or its day-two drift control not reconstructed from the actual collection';
const alwaysGreen = (shelves, length) => ({ ...shelfDropOrder(shelves, length), passed: true });
const s09Row = (r, lang = 'bi') =>
  r.checks.find((row) => row.id === `S09/${r.engines[0]} ${lang} · N`);
const driftRows = (r) => r.controls.filter((row) => row.id === 'day-two-drop-order-drift');
test('S09 cannot certify a consistently shortened prefix that still includes every control mutation', () => {
  for (const name of ['sweep', 'sweep-webkit']) {
    for (const length of [17, 39]) {
      const report = candidate(name);
      for (const lang of ['bi', 'ja']) {
        s09Row(report, lang).evidence = shelfDropOrder(observedNatural(), length);
        for (const drift of driftRows(report).filter((row) => row.lang === lang)) {
          Object.assign(
            drift,
            shelfDriftControl({ ...drift, awaiting: 'S09' }, observedNatural(), length),
          );
        }
      }
      const verdict = validateVisualReport(name, report, context);
      assert.equal(verdict.passed, false, `${name}: omitted ${40 - length} drop articles`);
      assert(verdict.errors.includes(S09_REJECTION));
    }
  }
});
test('S09 rejects a full-length consistently substituted drop member', () => {
  for (const name of ['sweep', 'sweep-webkit']) {
    const report = candidate(name);
    // Substitute an untouched tail member everywhere, so all prior order and control
    // consistency checks still agree. Independent membership must catch it.
    const expectedId = observedNatural()[0].ids[39];
    const substitute = (value) => {
      if (value === expectedId) return 'foreign-unreviewed-drop-member';
      if (Array.isArray(value)) return value.map(substitute);
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, substitute(item)]),
        );
      return value;
    };
    const verdict = validateVisualReport(name, substitute(report), context);
    assert.equal(verdict.passed, false);
    assert(verdict.errors.includes(S09_REJECTION));
  }
});
const swapPrefix = (ids) => {
  const next = [...ids];
  [next[0], next[2]] = [next[2], next[0]];
  return next;
};
for (const name of ['sweep', 'sweep-webkit'])
  test(`${name}: S09 and its day-two drift control are re-judged from the actual four-day collection`, () => {
    const original = candidate(name);
    assert.deepEqual(validateVisualReport(name, original, context).errors, []);
    const forgeries = {
      'S09 raw prefixes missing': (r) => {
        delete s09Row(r).evidence;
      },
      'S09 matrix missing a day': (r) => {
        const evidence = s09Row(r).evidence;
        evidence.days.pop();
        evidence.prefixes.pop();
      },
      'S09 matrix duplicates a day': (r) => {
        const evidence = s09Row(r).evidence;
        evidence.days[2] = evidence.days[1];
      },
      'S09 matrix holds day one only': (r) => {
        const evidence = s09Row(r).evidence;
        evidence.days = evidence.days.slice(0, 1);
        evidence.prefixes = evidence.prefixes.slice(0, 1);
      },
      'S09 prefix length shrunk to one card': (r) => {
        const evidence = s09Row(r).evidence;
        evidence.prefixLength = 1;
        evidence.prefixes = evidence.prefixes.map((prefix) => prefix.slice(0, 1));
      },
      'S09 and its drift control consistently judged on a prefix shorter than the observed order kills':
        (r) => {
          s09Row(r).evidence = shelfDropOrder(observedNatural(), 4);
          for (const drift of driftRows(r).filter((row) => row.lang === 'bi'))
            Object.assign(
              drift,
              shelfDriftControl({ ...drift, awaiting: 'S09' }, observedNatural(), 4),
            );
        },
      'S09 prefixes disagree with the observed day-three shelf': (r) => {
        const evidence = s09Row(r).evidence;
        evidence.prefixes[2] = swapPrefix(evidence.prefixes[2]);
      },
      'an always-green S09 passes a real day-three drift': (r) => {
        const natural = observedNatural().map((shelf, i) =>
          i === 2 ? { ...shelf, ids: swapPrefix(shelf.ids) } : shelf,
        );
        for (const row of r.controls)
          if (row.lang === 'bi' && row.day === observedDays[2])
            for (const key of ['baseline', 'changed', 'restored']) row[key] = swapPrefix(row[key]);
        s09Row(r).evidence = alwaysGreen(natural, OBSERVED_DROP_LENGTH);
        const drift = driftRows(r).find((row) => row.lang === 'bi');
        const forged = shelfDriftControl(
          { ...drift, awaiting: 'S09' },
          natural,
          OBSERVED_DROP_LENGTH,
          alwaysGreen,
        );
        Object.assign(drift, forged, {
          passed: true,
          failures: ['order'],
          judged: { ...forged.judged, order: false },
          s09: { ...forged.s09, mutant: { ...forged.s09.mutant, passed: false } },
        });
      },
      'drift control judged by an always-green S09 evaluator': (r) => {
        for (const drift of driftRows(r))
          Object.assign(
            drift,
            shelfDriftControl(
              { ...drift, awaiting: 'S09' },
              observedNatural(),
              OBSERVED_DROP_LENGTH,
              alwaysGreen,
            ),
          );
      },
      'always-green drift relabelled as a kill': (r) => {
        const drift = driftRows(r)[0];
        const forged = shelfDriftControl(
          { ...drift, awaiting: 'S09' },
          observedNatural(),
          OBSERVED_DROP_LENGTH,
          alwaysGreen,
        );
        Object.assign(drift, forged, {
          passed: true,
          failures: ['order'],
          judged: { ...forged.judged, order: false },
        });
      },
      'mutant four-day set never replaced day two': (r) => {
        const drift = driftRows(r)[0];
        drift.s09.mutant.prefixes = structuredClone(drift.s09.natural.prefixes);
      },
      'mutant replaced day three instead of day two': (r) => {
        const drift = driftRows(r)[0],
          prefixes = drift.s09.mutant.prefixes;
        [prefixes[1], prefixes[2]] = [prefixes[2], prefixes[1]];
      },
      'restored four-day set is not the actual collection': (r) => {
        const drift = driftRows(r)[0];
        drift.s09.restored.prefixes[3] = swapPrefix(drift.s09.restored.prefixes[3]);
      },
      'natural four-day set is not the actual collection': (r) => {
        const drift = driftRows(r)[0];
        drift.s09.natural.prefixes[0] = swapPrefix(drift.s09.natural.prefixes[0]);
      },
      'drift S09 triplet missing': (r) => {
        delete driftRows(r)[0].s09;
      },
      'drift natural matrix holds day one only': (r) => {
        const natural = driftRows(r)[0].s09.natural;
        natural.days = natural.days.slice(0, 1);
        natural.prefixes = natural.prefixes.slice(0, 1);
      },
      'drift evaluated on another day index': (r) => {
        driftRows(r)[0].s09.dayIndex = 0;
      },
      'drift baseline not the natural day-two shelf': (r) => {
        driftRows(r)[0].premise.naturalBaseline = false;
      },
      'drift order kill not taken from the mutant S09 result': (r) => {
        driftRows(r)[0].s09.mutant.passed = 'false';
      },
      'control baselines of one day disagree': (r) => {
        const row = r.controls.find(
          (control) =>
            control.lang === 'ja' &&
            control.day === observedDays[3] &&
            control.id === 'drop-duplicate-hides-omission',
        );
        const at = row.baseline.length - 1;
        [row.baseline[at], row.baseline[at - 1]] = [row.baseline[at - 1], row.baseline[at]];
        row.changed = [...row.baseline];
        row.changed[3] = row.baseline[1];
        row.restored = [...row.baseline];
      },
      'second drift row on the same engine and language': (r) => {
        r.controls.push(structuredClone(driftRows(r)[0]));
      },
    };
    for (const [label, mutate] of Object.entries(forgeries)) {
      const r = structuredClone(original);
      mutate(r);
      const judged = validateVisualReport(name, r, context);
      assert.equal(judged.passed, false, label);
      assert(judged.errors.includes(S09_REJECTION), label);
    }
  });
test('a mutated producer roster, comparator or line-break oracle cannot shrink visual admission', async () => {
  const output = process.env.RUNNER_TEMP || join(homedir(), '.dharma', 'bunki', 'test-fixtures');
  mkdirSync(output, { recursive: true });
  const root = mkdtempSync(join(output, 'visual-admission-'));
  try {
    const ci = join(root, 'scripts', 'ci'),
      tools = join(root, 'prototypes', 'corridor', 'tools');
    mkdirSync(ci, { recursive: true });
    mkdirSync(tools, { recursive: true });
    for (const name of [
      'vh-visual-report-contracts.mjs',
      'vh-visual-rosters.mjs',
      'vh-visual-reading-row-roster.json',
    ])
      writeFileSync(join(ci, name), readFileSync(new URL(name, import.meta.url)));
    const producer = new URL(
      '../../prototypes/corridor/tools/vh-visual-contracts.mjs',
      import.meta.url,
    ).href;
    writeFileSync(
      join(tools, 'vh-visual-contracts.mjs'),
      `import * as real from ${JSON.stringify(producer)};\n` +
        `export * from ${JSON.stringify(producer)};\n` +
        `export const DESIGN_CASES = Object.freeze(real.DESIGN_CASES.filter((id) => id !== 'G9-japanese-line-breaks-320'));\n` +
        `export const READING_CASES = Object.freeze(real.READING_CASES.filter((id) => id !== 'special'));\n` +
        `export const exactRoster = () => true;\n` +
        `export const plainBadBreak = () => '';\n`,
    );
    const roster = JSON.parse(
      readFileSync(
        new URL('../../prototypes/corridor/tools/vh-reading-row-roster.json', import.meta.url),
      ),
    );
    delete roster.cases.special;
    roster.cases.reader = roster.cases.reader.filter((id) => id !== 'reader.page-errors');
    roster.captureWithR2 = [];
    writeFileSync(join(tools, 'vh-reading-row-roster.json'), JSON.stringify(roster));
    const mutated = await import(pathToFileURL(join(tools, 'vh-visual-contracts.mjs')).href);
    assert.equal(mutated.DESIGN_CASES.length, 49);
    assert.equal(mutated.exactRoster(['a'], []), true);
    assert.equal(mutated.plainBadBreak('サボる', 2), '');
    const altered = await import(pathToFileURL(join(ci, 'vh-visual-report-contracts.mjs')).href);
    assert.equal(altered.visualReportContracts['design-reader-shelf'].expectedCases().length, 50);
    assert(
      altered.visualReportContracts['design-reader-shelf']
        .expectedCases()
        .includes('chromium/G9-japanese-line-breaks-320'),
    );
    assert.equal(altered.visualReportContracts['reading-truth'].expectedCases().length, 120);
    assert.deepEqual(
      altered.visualReportContracts['reading-truth'].expectedCases(),
      visualReportContracts['reading-truth'].expectedCases(),
    );
    for (const name of Object.keys(visualReportContracts)) {
      const report = candidate(name);
      assert.equal(altered.validateVisualReport(name, report, context).passed, true, name);
    }
    const design = candidate('design-reader-shelf');
    design.results = design.results.filter((row) => row.name !== 'G9-japanese-line-breaks-320');
    assert.equal(
      altered.validateVisualReport('design-reader-shelf', design, context).passed,
      false,
    );
    const duplicate = candidate('design-reader-shelf');
    duplicate.results[1] = structuredClone(duplicate.results[0]);
    assert.equal(
      altered.validateVisualReport('design-reader-shelf', duplicate, context).passed,
      false,
    );
    const reading = candidate('reading-truth');
    reading.rows = reading.rows.filter((row) => row.id !== 'reader.page-errors');
    reading.observedCases = reading.observedCases.filter((id) => !id.endsWith('/special'));
    assert.equal(altered.validateVisualReport('reading-truth', reading, context).passed, false);
    const comb = candidate('comb-0');
    comb.controls[0].candidate.breaks = [2];
    assert.equal(altered.validateVisualReport('comb-0', comb, context).passed, false);
    assert.equal(DESIGN_CASES.length, 50);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
