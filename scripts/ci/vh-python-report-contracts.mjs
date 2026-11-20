import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, globSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
export const pythonReportRosters = Object.freeze(
  JSON.parse(
    readFileSync(new globalThis.URL('./vh-python-report-rosters.json', import.meta.url), 'utf8'),
  ),
);
export const PYTHON_REPORTS = Object.freeze(
  Object.fromEntries(
    Object.entries(pythonReportRosters).map(([gate, spec]) => [
      gate,
      { path: 'verification-report.json', type: 'vh-python-checks', producer: spec.producer },
    ]),
  ),
);
export function validatePythonReport(
  report,
  { gateId, runId, gitSha, root, verifierSha256, contractSha256, helperSha256 } = {},
) {
  const spec = pythonReportRosters[gateId];
  assert(spec, 'unknown custom Python report contract');
  assert.equal(report?.schema, 'vh-python-checks/1');
  assert.equal(report.gateId, gateId);
  assert(runId && report.runId === runId, 'fresh runId required');
  assert(gitSha && report.gitSha === gitSha, 'source SHA required');
  assert.equal(report.sourceOnly, true);
  assert.equal(report.artifactSha256, null);
  assert(
    Array.isArray(report.invocation) &&
      report.invocation.length === 2 &&
      report.invocation[1].endsWith('/' + spec.producer),
    'full original invocation required',
  );
  assert(/^\d+\.\d+\.\d+/u.test(report.pythonVersion), 'actual Python version required');
  for (const name of ['fugashi', 'unidic-lite'])
    assert(
      typeof report.dependencyVersions?.[name] === 'string' &&
        report.dependencyVersions[name].length > 0,
      `actual ${name} version required`,
    );
  assert.equal(report.verifierPath, spec.producer);
  assert.equal(report.scope, 'full');
  assert.equal(report.completed, true);
  assert.equal(report.inputsUnchanged, true);
  assert.equal(report.fullAcceptance, true);
  assert.deepEqual(report.errors, []);
  const digest = (path) =>
    createHash('sha256')
      .update(readFileSync(resolve(root, path)))
      .digest('hex');
  const tool = verifierSha256 || (root && digest(spec.producer));
  const contract = contractSha256 || (root && digest('scripts/ci/vh-python-report-rosters.json'));
  const helper = helperSha256 || (root && digest('scripts/ci/vh_python_receipts.py'));
  assert(tool && report.verifierSha256 === tool, 'exact verifier identity required');
  assert(contract && report.contractSha256 === contract, 'exact reviewed roster identity required');
  assert(helper && report.helperSha256 === helper, 'exact observation helper identity required');
  assert(Array.isArray(report.checks));
  assert.equal(report.checks.length, spec.checks.length, 'whole check roster required');
  assert.equal(
    new Set(report.checks.map((row) => row.id)).size,
    spec.checks.length,
    'no duplicate hides a missing check',
  );
  for (const expected of spec.checks) {
    const actual = report.checks.find((row) => row.id === expected.id);
    assert(
      actual &&
        actual.name === expected.name &&
        expected.callsites.includes(actual.callsite) &&
        actual.pass === true,
      `missing/failed/misbound ${expected.id}`,
    );
  }
  assert(
    report.inputs && Object.keys(report.inputs).length > 0,
    'fixture input identities required',
  );
  if (root) {
    const expectedInputs = [
      ...new Set(
        spec.inputs.flatMap((pattern) =>
          globSync(pattern, { cwd: root }).filter((path) => statSync(resolve(root, path)).isFile()),
        ),
      ),
    ].sort();
    assert.deepEqual(
      Object.keys(report.inputs).sort(),
      expectedInputs,
      'exact declared fixture file census required',
    );
  }
  for (const [path, sha] of Object.entries(report.inputs)) {
    assert(/^[a-f0-9]{64}$/u.test(sha), 'input SHA256 required');
    if (root) assert.equal(sha, digest(path), `input changed: ${path}`);
  }
  for (const pattern of spec.inputs.filter((path) => !path.includes('*')))
    assert(Object.hasOwn(report.inputs, pattern), `missing required input ${pattern}`);
  assert(
    Number.isFinite(Date.parse(report.startedAt)) &&
      Number.isFinite(Date.parse(report.finishedAt)) &&
      Date.parse(report.finishedAt) >= Date.parse(report.startedAt),
    'complete chronological receipt required',
  );
  return true;
}
