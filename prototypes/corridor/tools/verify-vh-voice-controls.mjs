/** COPY-VOICE sensitivity: local VM fixtures only; never Audio/network/browser/provider calls. */
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const sourcePath = resolve(here, '../corridor.js');
const source = readFileSync(sourcePath, 'utf8');
const plan = JSON.parse(readFileSync(join(root, 'scripts/ci/P3-vh-six/operators.json'), 'utf8'));
const controls = plan.controls;
const digest = (s) => createHash('sha256').update(s).digest('hex');
const assertionContract = plan.intendedAssertionContract;
assert.equal(assertionContract.schemaVersion, 1, 'intended assertion contract schema');
assert.equal(assertionContract.fixture, plan.fixture, 'intended assertion fixture');
assert.equal(digest(readFileSync(join(root, plan.fixture))), assertionContract.fixtureSha256, 'intended assertion fixture identity');
const runId = process.env.KAIRO_GATE_RUN_ID || randomUUID();
const out = resolveCorridorEvidence();
assert(!process.env.KAIRO_CORRIDOR_SOURCE, 'voice mutation parent must start with the real source');
assert.equal(digest(source), plan.sourceSha256, 'current source identity');
function matchesIntendedAssertion(output, control) {
  const expected = assertionContract.byControl[control.id];
  try {
    if (!expected || expected.test !== control.test) return false;
    const lines = output.split('\n');
    const result = lines.findIndex((line) => line === `not ok 1 - ${control.test}`);
    if (result < 0 || lines[result + 1] !== '  ---') return false;
    const end = lines.indexOf('  ...', result + 2);
    if (end < 0) return false;
    const diagnostic = parseYaml(lines.slice(result + 2, end).join('\n'), {
      maxAliasCount: 0,
      strict: true,
      uniqueKeys: true,
    });
    if (!diagnostic || typeof diagnostic !== 'object' || Array.isArray(diagnostic)) return false;
    const fields = ['error', 'failureType', 'name', 'code', 'operator', 'actual', 'expected', 'stack'];
    if (!fields.every((field) => Object.hasOwn(diagnostic, field))) return false;
    if (typeof diagnostic.error !== 'string' || diagnostic.error.split('\n', 1)[0] !== expected.message) return false;
    if (diagnostic.failureType !== assertionContract.failureType
      || diagnostic.name !== assertionContract.name
      || diagnostic.code !== assertionContract.code
      || diagnostic.operator !== expected.operator
      || !Object.is(diagnostic.actual, expected.actual)
      || !Object.is(diagnostic.expected, expected.expected)
      || typeof diagnostic.stack !== 'string') return false;
    const firstFrame = diagnostic.stack.split('\n', 1)[0];
    const site = firstFrame.match(/\((file:\/\/[^)\s]+):(\d+):(\d+)\)$/u)
      || firstFrame.match(/^(file:\/\/\S+):(\d+):(\d+)$/u);
    return !!site
      && resolve(fileURLToPath(site[1])) === resolve(root, assertionContract.fixture)
      && Number(site[2]) === expected.line
      && Number(site[3]) === expected.column;
  } catch {
    return false;
  }
}
const rows = [];
for (const control of controls) {
  const dir = join(out, runId, control.id); mkdirSync(dir, { recursive: true });
  assert.equal(source.split(control.from).length, 2, `${control.id}: exact unique source anchor`);
  const mutant = source.replace(control.from, control.to);
  assert.equal(digest(mutant), control.expectedMutationSha256, `${control.id}: reviewed mutation identity`);
  const phases = [];
  for (const phase of ['baseline', 'mutant', 'restore']) {
    const nonce = randomUUID(), input = join(dir, `${phase}-${nonce}.js`);
    const inputDigest = phase === 'mutant' ? digest(mutant) : digest(source);
    writeFileSync(input, phase === 'mutant' ? mutant : source);
    const childReceipt = join(dir, `${phase}-${nonce}.json`);
    const pattern = `^${control.test.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
    const child = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=${pattern}`, join(root, plan.fixture)], {
      env: { ...process.env, KAIRO_CORRIDOR_SOURCE: input, VH_SIX_PHASE_RECEIPT: childReceipt,
        VH_SIX_EXPECT_INPUT_SHA256: inputDigest, VH_SIX_CONTROL_ID: control.id },
      encoding: 'utf8', timeout: plan.phaseTimeoutMs, maxBuffer: 4 * 1024 * 1024,
    });
    const output = `${child.stdout || ''}${child.stderr || ''}`;
    const tap = join(dir, `${phase}-${nonce}.tap`);
    writeFileSync(tap, output);
    const tests = [...output.matchAll(/^(not ok|ok) \d+ - (.+)$/gmu)].filter((m) => !m[2].includes('# SKIP'));
    const completed = !child.error && !child.signal && tests.length === 1 && tests[0][2] === control.test
      && /# tests 1\n/u.test(output) && /# cancelled 0\n/u.test(output) && /# skipped 0\n/u.test(output) && /# todo 0\n/u.test(output);
    const intended = completed && tests[0][1] === 'not ok' && matchesIntendedAssertion(output, control);
    const ok = completed && (phase === 'mutant' ? child.status === 1 && tests[0][1] === 'not ok' && intended : child.status === 0 && tests[0][1] === 'ok');
    phases.push({ phase, nonce, input, tap, tapSha256: digest(output), childReceipt, childReceiptSha256: digest(readFileSync(childReceipt)), digest: digest(readFileSync(input)), exit: child.status, signal: child.signal, error: child.error?.message || null, completed, intended, ok });
  }
  const restored = digest(readFileSync(sourcePath)) === digest(source) && phases[0].digest === phases[2].digest;
  const status = restored && phases.every((p) => p.ok) ? 'caught' : phases.every((p) => p.completed) ? 'not-caught' : 'not-run';
  rows.push({ control: control.id, sourceAnchor: control.from, matches: 1, sourceSha256: digest(source), mutationSha256: digest(mutant), witness: control.witness, phases, restored, status });
  console.log(`${control.id}: ${status}`);
}
const fullAcceptance = rows.length === controls.length && rows.every((row) => row.status === 'caught');
writeFileSync(join(out, 'verify-vh-voice-controls.json'), `${JSON.stringify({ schemaVersion: 1, runId,
  sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: here, encoding: 'utf8' }).trim(), sourceSha256: digest(source), verifierSha256: digest(readFileSync(fileURLToPath(import.meta.url))),
  sourceOnly: true, nativeInputExecuted: false, scope: 'mechanics-only; no shipped media availability or voice-quality claim', expectedCases: controls.map((c) => c.id), observedCases: rows.map((r) => r.control),
  selectedPassed: fullAcceptance, fullAcceptance, rows }, null, 2)}\n`);
process.exitCode = fullAcceptance ? 0 : 1;
