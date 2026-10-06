/** Import observed fail-then-pass pairs; this helper never commits or pushes. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { batteryGates } from '../verify-release-gates.mjs';
import { supplementalGates } from './supplemental.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const parse = (file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const gates = new Set(
  [...batteryGates('/unused', {}), ...supplementalGates('/unused')].map((g) => g.name),
);
export function validateFlake(row) {
  assert.equal(row.schemaVersion, 1);
  assert(['observed-ci', 'controlled-experiment'].includes(row.source));
  assert(/^[a-z][a-z0-9-]*$/.test(row.gate));
  assert(
    gates.has(row.gate) || row.source === 'controlled-experiment',
    'Unknown gate cannot become an ordinary flake',
  );
  assert.match(row.sha, /^[a-f0-9]{40}$/);
  assert.match(String(row.runId), /^\d+$/);
  assert(Number.isSafeInteger(row.runAttempt) && row.runAttempt > 0);
  assert.equal(typeof row.runner, 'string');
  assert.equal(typeof row.firstRunner, 'string');
  assert(row.runner && row.firstRunner);
  assert.notEqual(row.runner, row.firstRunner, 'Fresh runner evidence required');
  assert(
    Array.isArray(row.durations) &&
      row.durations.length === 2 &&
      row.durations.every((value) => Number.isFinite(value) && value >= 0),
  );
  assert(Array.isArray(row.jobIds) && row.jobIds.length === 2);
  for (const id of row.jobIds) assert.match(String(id), /^\d+$/);
  assert.notEqual(String(row.jobIds[0]), String(row.jobIds[1]));
  assert.deepEqual(row.attempts, [1, 2]);
  assert(Array.isArray(row.statuses) && row.statuses.length === 2);
  assert(['failed', 'missing', 'timed-out', 'incomplete'].includes(row.statuses[0]));
  assert.equal(row.statuses[1], 'passed');
  assert(Array.isArray(row.evidence) && row.evidence.length === 2);
  for (const [index, url] of row.evidence.entries())
    assert.equal(
      url,
      `https://github.com/AmitabhainArunachala/Bunki-app/actions/runs/${row.runId}/job/${row.jobIds[index]}`,
    );
  return row;
}
export function importFlakes(ledgerFile, inputFile, source) {
  const existing = parse(ledgerFile).map(validateFlake),
    incoming = parse(inputFile).map((row) => validateFlake(source ? { ...row, source } : row));
  const key = (row) => `${row.sha}/${row.runId}/${row.runAttempt}/${row.gate}`;
  const seen = new Map(existing.map((row) => [key(row), row]));
  assert.equal(seen.size, existing.length, 'Duplicate ledger evidence');
  for (const row of incoming) {
    const previous = seen.get(key(row));
    if (previous) assert.deepEqual(previous, row, 'Conflicting flake evidence');
    else seen.set(key(row), row);
  }
  const rows = [...seen.values()].sort(
    (a, b) =>
      Number(a.runId) - Number(b.runId) ||
      a.runAttempt - b.runAttempt ||
      a.gate.localeCompare(b.gate),
  );
  writeFileSync(ledgerFile, rows.map((row) => JSON.stringify(row) + '\n').join(''));
  return { added: rows.length - existing.length, total: rows.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const option = (name) => {
      const i = args.indexOf(name);
      return i < 0 ? undefined : args[i + 1];
    };
    const input = option('--input');
    assert(input, '--input JSONL required');
    const ledger = option('--ledger') || join(ROOT, 'docs/ci/flakes.jsonl');
    console.log(JSON.stringify(importFlakes(ledger, input, option('--source'))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
