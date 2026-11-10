/* global URL, process */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { resolveCorridorEvidence } from '../scripts/resolve-corridor-site.mjs';
import { retainedReportContracts } from '../scripts/ci/vh-retained-report-contracts.mjs';
import { readAuthoredCorridor } from '../prototypes/corridor/tools/authored-corridor-source.mjs';
import {
  INVENTORY,
  WORD_CONTROLS,
  LEARNING_RECORD_CONTROLS,
  admitControl,
  applyControl,
  runControls,
  sha256,
} from '../prototypes/corridor/tools/word-saved-answer-controls.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HERE = new URL('../prototypes/corridor/tools/', import.meta.url);
const TEST_FILE = fileURLToPath(new URL('test-word-saved-answer.mjs', HERE));
const LEARNING_RECORD_FILE = fileURLToPath(new URL('verify-learning-record.mjs', HERE));

// The controls run 38 children one after another: 186 s on an M5, and on a hosted runner 368 s
// (next / core run 42767964278), then 586, 593 and 601 s (runs 42770473278, 42773527715 and
// 42776971188). The last of those crossed the 600 s this test had and failed a run in which every
// other test was green. The work is unchanged; the budget is now 900 s.
test('the actual saved-answer controls run and every declared child is killed', async () => {
  const authored = readAuthoredCorridor(
    fileURLToPath(new URL('../prototypes/corridor/', import.meta.url)),
  );
  assert(authored.files.some((file) => file.path.startsWith('modules/')));
  assert.equal(Object.keys(WORD_CONTROLS).length, 34);
  assert.equal(Object.keys(LEARNING_RECORD_CONTROLS).length, 2);
  for (const table of [WORD_CONTROLS, LEARNING_RECORD_CONTROLS])
    for (const name of Object.keys(table)) {
      const mutant = applyControl(authored.source, table, name);
      assert.notEqual(sha256(mutant), sha256(authored.source), name);
    }

  const owner = process.env.KAIRO_EVIDENCE_DIR;
  const evidence = mkdtempSync(join(resolveCorridorEvidence(), 'saved-answer-source'));
  try {
    const report = await runControls({
      root: ROOT,
      testFile: TEST_FILE,
      learningRecordFile: LEARNING_RECORD_FILE,
      evidence,
    });
    const wordNames = Object.keys(WORD_CONTROLS);
    const learningNames = Object.keys(LEARNING_RECORD_CONTROLS);
    const expectedChildren = [
      'tap-baseline',
      ...wordNames.map((name) => `tap-${name}`),
      'learning-baseline',
      ...learningNames.map((name) => `learning-${name}`),
    ];
    assert.deepEqual(report.inventory, INVENTORY);
    assert.equal(report.children.length, 38);
    assert.equal(report.verdicts.length, 36);
    assert.deepEqual(
      report.children.map((child) => child.child),
      expectedChildren,
    );
    assert.equal(report.children.filter((child) => child.role === 'baseline').length, 2);
    assert.equal(report.children.filter((child) => child.role === 'control').length, 36);
    assert(
      report.children.every((child) => child.complete),
      JSON.stringify(report.children.filter((child) => !child.complete)),
    );
    assert.deepEqual(
      report.verdicts.map((verdict) => verdict.control),
      [...wordNames, ...learningNames],
    );
    assert.deepEqual(
      report.verdicts.map((verdict) => verdict.suite),
      [
        ...wordNames.map(() => 'test-word-saved-answer'),
        ...learningNames.map(() => 'verify-learning-record'),
      ],
    );
    assert(
      report.verdicts.every((verdict) => verdict.verdict === 'killed'),
      JSON.stringify(report.verdicts.filter((verdict) => verdict.verdict !== 'killed')),
    );
    assert.deepEqual(report.pins.after, report.pins.before);
    assert.equal(Object.keys(report.pins.before).length, 19);
    assert.equal(report.pins.stable, true);
    assert.equal(report.pass, true);
    const admission = retainedReportContracts['word-saved-answer-mutation-controls'].validate(
      report,
      {
        root: ROOT,
        out: dirname(evidence),
        gateId: basename(evidence),
        startedAt: report.phase.startedAt,
        args: ['prototypes/corridor/tools/test-word-saved-answer.mjs', '--controls'],
        verifierSha256: sha256(readFileSync(TEST_FILE)),
        sourceVerifiedBeforeAndAfter: report.pins.stable,
        readReport: (path) => JSON.parse(readFileSync(join(evidence, path), 'utf8')),
      },
    );
    assert.deepEqual(admission.errors, []);
    assert.equal(admission.passed, true);
    assert.deepEqual(admission.observedCases, expectedChildren);

    const baseline = {
      complete: true,
      problems: [],
      results: new Map(INVENTORY.map((id) => [id, true])),
    };
    const control = WORD_CONTROLS.C10;
    const run = (failed = [], overrides = {}) => ({
      complete: true,
      problems: [],
      results: new Map(INVENTORY.map((id) => [id, !failed.includes(id)])),
      ...overrides,
    });
    const verdict = (candidate) =>
      admitControl({ baseline, run: candidate, control, inventory: INVENTORY }).verdict;
    assert.equal(verdict(run(['T8'])), 'killed');
    assert.equal(
      verdict(run(['T8'], { complete: false, problems: ['spawn-error:timeout:ETIMEDOUT'] })),
      'incomplete',
    );
    assert.equal(
      verdict(run(['T8'], { complete: false, problems: ['exit-1-without-failures'] })),
      'incomplete',
    );
    assert.equal(
      verdict(run(['T8'], { complete: false, problems: ['exit-0-with-failures'] })),
      'incomplete',
    );
    assert.equal(verdict(run()), 'survived');
  } finally {
    if (!owner) rmSync(evidence, { recursive: true, force: true });
  }
}, 900_000);
