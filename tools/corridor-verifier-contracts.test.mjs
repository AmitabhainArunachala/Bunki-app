import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Execute the actual Node contract suites through npm test's existing browser-capable
// Vitest shard. TAP is the child test runner's explicit result protocol.
function requireContracts(file, cases) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
    cwd: root,
    encoding: 'utf8',
    timeout: 90000,
    maxBuffer: 4 * 1024 * 1024,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const counts = Object.fromEntries(
    [...result.stdout.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)].map(
      (row) => [row[1], Number(row[2])],
    ),
  );
  expect(counts).toEqual({ tests: cases, pass: cases, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
}
test('offline boot dependency contracts execute every case without skips', () => {
  requireContracts('prototypes/corridor/tools/offline-boot-closure.test.mjs', 8);
}, 120000);
test('source kanji transition contracts execute every case without skips', () => {
  requireContracts('prototypes/corridor/tools/source-kanji-baseline.test.mjs', 4);
}, 120000);
