import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  globSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
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
    // INT-VH (merge 2): Hfix-1A's さもなければかの fixture (two rows) and its ばかの guard: 13 → 16
    [19, 32, 16],
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
    5,
  );
  assert(
    pythonReportRosters['deck-export-mcd'].checks.some((row) =>
      row.name.includes('(32 files, 954 passages, 323 words)'),
    ),
  );
});

test('root-bound Python admission hashes actual files and the complete on-disk input census', () => {
  const parent = join(homedir(), '.dharma/bunki/verifier-receipts/python-tests');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'root-binding-'));
  const hash = (path) =>
    createHash('sha256')
      .update(readFileSync(join(root, path)))
      .digest('hex');
  const put = (path, bytes) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
  };
  try {
    for (const [gate, spec] of Object.entries(pythonReportRosters)) {
      // This is an admission fixture, not a claim that these Python checks ran.
      // Unlike the digest-injection unit fixtures, every identity here is read
      // independently from a real root by the production validator.
      put(spec.producer, '# Python producer fixture\n');
      put(
        'scripts/ci/vh-python-report-rosters.json',
        readFileSync(new globalThis.URL('./vh-python-report-rosters.json', import.meta.url)),
      );
      put(
        'scripts/ci/vh_python_receipts.py',
        readFileSync(new globalThis.URL('./vh_python_receipts.py', import.meta.url)),
      );
      for (const pattern of spec.inputs) {
        if (pattern.includes('*'))
          put(pattern.slice(0, pattern.indexOf('*')) + 'fixture.json', '{}\n');
        else put(pattern, '# fixture input\n');
      }
      const r = receipt(gate);
      r.invocation = ['/usr/bin/python3', join(root, spec.producer)];
      r.verifierSha256 = hash(spec.producer);
      r.contractSha256 = hash('scripts/ci/vh-python-report-rosters.json');
      r.helperSha256 = hash('scripts/ci/vh_python_receipts.py');
      const inputs = [
        ...new Set(
          spec.inputs.flatMap((pattern) =>
            globSync(pattern, { cwd: root }).filter((p) => statSync(join(root, p)).isFile()),
          ),
        ),
      ];
      r.inputs = Object.fromEntries(inputs.map((path) => [path, hash(path)]));
      const context = { gateId: gate, runId: r.runId, gitSha, root };
      assert.equal(validatePythonReport(r, context), true);
      for (const path of [
        spec.producer,
        'scripts/ci/vh-python-report-rosters.json',
        'scripts/ci/vh_python_receipts.py',
        ...inputs,
      ]) {
        const bytes = readFileSync(join(root, path));
        put(path, Buffer.concat([bytes, Buffer.from('\nchanged\n')]));
        assert.throws(
          () => validatePythonReport(r, context),
          undefined,
          `${gate}: changed ${path}`,
        );
        put(path, bytes);
      }
      const glob = spec.inputs.find((pattern) => pattern.includes('*'));
      if (glob) {
        const extra = glob.slice(0, glob.indexOf('*')) + 'unreported.json';
        put(extra, '{}\n');
        assert.throws(() => validatePythonReport(r, context), /census/u);
        rmSync(join(root, extra));
      }
      const removed = inputs[0],
        bytes = readFileSync(join(root, removed));
      rmSync(join(root, removed));
      assert.throws(() => validatePythonReport(r, context));
      put(removed, bytes);
      assert.equal(validatePythonReport(r, context), true);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
