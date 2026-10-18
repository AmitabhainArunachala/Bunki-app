import test from 'node:test';
import assert from 'node:assert/strict';
import { pythonReportRosters, validatePythonReport } from './vh-python-report-contracts.mjs';
const digest = 'a'.repeat(64),
  gitSha = 'b'.repeat(40);
const options = (gateId) => ({
  gateId,
  runId: 'fresh-attempt',
  gitSha,
  verifierSha256: digest,
  contractSha256: digest,
  helperSha256: digest,
});
const receipt = (gateId) => ({
  schema: 'vh-python-checks/1',
  gateId,
  runId: 'fresh-attempt',
  gitSha,
  sourceOnly: true,
  artifactSha256: null,
  verifierPath: pythonReportRosters[gateId].producer,
  verifierSha256: digest,
  contractSha256: digest,
  helperSha256: digest,
  scope: 'full',
  invocation: ['/python', '/repo/' + pythonReportRosters[gateId].producer],
  pythonVersion: '3.11.15',
  dependencyVersions: { fugashi: '1.5.2', 'unidic-lite': '1.0.8' },
  completed: true,
  inputsUnchanged: true,
  fullAcceptance: true,
  errors: [],
  startedAt: '2026-10-19T00:00:00Z',
  finishedAt: '2026-10-19T00:00:01Z',
  inputs: Object.fromEntries(
    pythonReportRosters[gateId].inputs.map((pattern) => [
      pattern.includes('*') ? 'decks/kotoba-mine/source/gloss_ja.json' : pattern,
      digest,
    ]),
  ),
  checks: pythonReportRosters[gateId].checks.map((row) => ({
    id: row.id,
    name: row.name,
    callsite: row.callsites[0],
    pass: true,
  })),
});
for (const gate of Object.keys(pythonReportRosters))
  test(`${gate}: exact named/callsite roster and fresh identity, no partial green`, () => {
    assert.equal(validatePythonReport(receipt(gate), options(gate)), true);
    for (const mutate of [
      (r) => (r.checks = []),
      (r) => r.checks.pop(),
      (r) => (r.checks[0] = { ...r.checks[1] }),
      (r) => (r.checks[0].pass = false),
      (r) => (r.checks[0].callsite = 'invented.py:1'),
      (r) => (r.runId = 'stale'),
      (r) => (r.gitSha = 'c'.repeat(40)),
      (r) => (r.fullAcceptance = false),
      (r) => (r.scope = 'filtered'),
      (r) => (r.completed = false),
      (r) => (r.errors = ['setup timeout']),
      (r) => (r.inputs = {}),
      (r) => (r.inputsUnchanged = false),
      (r) => (r.verifierSha256 = 'd'.repeat(64)),
      (r) => (r.helperSha256 = 'd'.repeat(64)),
      (r) => (r.contractSha256 = 'd'.repeat(64)),
    ]) {
      const row = receipt(gate);
      mutate(row);
      assert.throws(() => validatePythonReport(row, options(gate)));
    }
    // Every single named observation is independently required, including expanded dynamic fixture cases.
    for (let index = 0; index < pythonReportRosters[gate].checks.length; index++) {
      const row = receipt(gate);
      row.checks.splice(index, 1);
      assert.throws(() => validatePythonReport(row, options(gate)));
    }
  });
test('reviewed census keeps all explicit dynamic fixture cases', () => {
  assert.deepEqual(
    Object.values(pythonReportRosters).map((spec) => spec.checks.length),
    [19, 32, 13],
  );
  assert.equal(
    pythonReportRosters['deck-gloss-ja'].checks.filter((row) =>
      row.name.startsWith('gloss_ja() refuses'),
    ).length,
    5,
  );
  assert.equal(
    pythonReportRosters['deck-segment-overrides'].checks.filter((row) =>
      row.name.includes('without the lexicon'),
    ).length,
    4,
  );
  assert(
    pythonReportRosters['deck-export-mcd'].checks.some((row) =>
      row.name.includes('(32 files, 954 passages, 323 words)'),
    ),
  );
});
