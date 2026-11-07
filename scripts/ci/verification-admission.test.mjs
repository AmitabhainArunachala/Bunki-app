import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptanceEnvironment,
  NARROWING_ENV,
  exactIds,
  requireNodeSuite,
  digest,
} from './verification-admission.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('each ambient narrower/fault is cleared; only the declared engine wins', () => {
  for (const name of NARROWING_ENV) {
    const env = acceptanceEnvironment(
      { [name]: 'narrow-or-fault', PATH: '/bin', KAIRO_BROWSER: 'webkit' },
      { KAIRO_BROWSER: 'chromium' },
    );
    assert.equal(env[name], undefined, name);
    assert.equal(env.PATH, '/bin');
    assert.equal(env.KAIRO_BROWSER, 'chromium');
  }
});
test('an ambient standalone handoff, browser driver/binary or child nonce never reaches an acceptance child', () => {
  const env = acceptanceEnvironment(
    {
      PATH: '/bin',
      GUIDED_STANDALONE: '/elsewhere/corridor-standalone.html',
      KAIRO_PLAYWRIGHT_MODULE: '/elsewhere/playwright/index.mjs',
      PERSONAL_CHROMIUM: '/elsewhere/chrome',
      RECORD_DEPTH_NONCE: 'copied-child-nonce',
    },
    { KAIRO_BROWSER: 'webkit' },
  );
  assert.deepEqual(env, { PATH: '/bin', KAIRO_BROWSER: 'webkit' });
});
test('exact nonempty case roster rejects missing, extra and same-count duplicates', () => {
  for (const observed of [[], ['A'], ['A', 'A'], ['A', 'B', 'C']])
    assert.throws(() => exactIds(['A', 'B'], observed));
  exactIds(['A', 'B'], ['B', 'A']);
});
test('Node framework evidence cannot promote skipped, absent-file, or empty tests', () => {
  const file = fileURLToPath(import.meta.url);
  const summary = {
    success: true,
    counts: { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 },
  };
  const clean = () => ({
    kind: 'bunki-node-test-suite',
    fullAcceptance: true,
    files: [
      { file, sha256: digest(readFileSync(file)), summary: globalThis.structuredClone(summary) },
    ],
    scheduled: [{ file, name: 'one', nesting: 0, line: 1 }],
    tests: [{ file, name: 'one', nesting: 0, line: 1, status: 'passed' }],
    summary: globalThis.structuredClone(summary),
  });
  requireNodeSuite(clean(), [file], process.cwd());
  for (const mutate of [
    (r) => r.files.pop(),
    (r) => r.tests.pop(),
    (r) => (r.tests[0].name = 'foreign'),
    (r) => r.scheduled.push(r.scheduled[0]),
    (r) => r.files[0].summary.counts.skipped++,
    (r) => (r.fullAcceptance = false),
  ]) {
    const r = clean();
    mutate(r);
    assert.throws(() => requireNodeSuite(r, [file], process.cwd()));
  }
});
