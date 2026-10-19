import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { join } from 'node:path';
import { batteryGates } from '../verify-release-gates.mjs';
import { supplementalGates } from './supplemental.mjs';
import { gateEvidenceDeclaration } from './gate-evidence.mjs';
import { acceptanceEnvironment } from './verification-admission.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url)),
  out = '/independent-coverage-only/no-execution';
const gates = [...batteryGates(out, {}), ...supplementalGates(out)];
const known = new Set(['KAIRO_BROWSER', 'PERSONAL_HOST_BROWSER', 'PERSONAL_BROWSERS']);
const modules = [];
for (const file of readdirSync(join(root, 'scripts/ci')).filter((f) =>
  /^vh-.*-report-contracts\.mjs$/u.test(f),
)) {
  const module = await import(new URL(file, import.meta.url));
  modules.push({ file, module });
  for (const [name, value] of Object.entries(module))
    if (/narrowing.*environment/iu.test(name)) {
      assert(Array.isArray(value));
      for (const key of value) known.add(key);
    }
}
test('all 189 canonical and supplemental gates have unique names and mandatory declarations', () => {
  assert.equal(gates.length, 189);
  assert.equal(new Set(gates.map((g) => g.name)).size, 189);
  const expected = JSON.parse(
    readFileSync(new URL('./vh-required-gate-roster.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(
    gates.map((g) => g.name).sort(),
    [...expected.requiredNames].sort(),
    'Exact reviewed required gate roster',
  );
  const declared = gates.map((gate) => gateEvidenceDeclaration(gate, root, out));
  assert.equal(declared.length, gates.length);
  assert(declared.every((d) => d && d.kind && d.kind !== 'process-probe'));
  assert.throws(
    () =>
      gateEvidenceDeclaration(
        { name: 'unknown-producer', command: process.execPath, args: ['-e', 'process.exit(0)'] },
        root,
        out,
      ),
    /No required evidence contract/u,
  );
});
test('every exported selector is removed from ambient input, including empty values', () => {
  for (const value of ['diagnostic-mutant', '']) {
    const ambient = {
      ...Object.fromEntries([...known].map((key) => [key, value])),
      VH_INDEPENDENT_SAFE_MARKER: 'preserved',
    };
    const actual = acceptanceEnvironment(ambient);
    for (const key of known)
      assert.equal(actual[key], key === 'KAIRO_BROWSER' ? 'chromium' : undefined, key);
    assert.equal(actual.VH_INDEPENDENT_SAFE_MARKER, 'preserved');
    assert.equal(ambient.KAIRO_BROWSER, value, 'sanitization must not mutate its caller');
  }
});
test('all gate descriptors preserve only explicit selector authority', () => {
  const ambient = Object.fromEntries([...known].map((key) => [key, 'hostile-ambient']));
  for (const gate of gates) {
    const env = acceptanceEnvironment(ambient, gate.env || {});
    for (const key of known)
      assert.equal(
        env[key],
        Object.hasOwn(gate.env || {}, key)
          ? gate.env[key]
          : key === 'KAIRO_BROWSER'
            ? 'chromium'
            : undefined,
        `${gate.name}/${key}`,
      );
  }
});
test('every exported adapter fails closed for absent and malformed producer receipts', () => {
  const context = {
    engine: 'chromium',
    runId: 'attempt',
    artifactSha256: 'a'.repeat(64),
    verifierSha256: 'b'.repeat(64),
  };
  for (const { file, module } of modules)
    for (const [name, map] of Object.entries(module))
      if (/ReportContracts$/u.test(name)) {
        for (const [gate, contract] of Object.entries(map))
          for (const report of [
            null,
            {},
            { results: [], checks: [], rows: [], passed: true, failures: 0, fullAcceptance: true },
          ]) {
            let result;
            try {
              result = contract.validate(report, context);
            } catch {
              continue;
            }
            assert.notEqual(
              result?.passed,
              true,
              `${file}/${gate} accepted an absent/malformed receipt`,
            );
          }
      }
});
