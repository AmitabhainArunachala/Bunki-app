/** Temporary hosted retry control. Removed after real first/retry evidence is retained. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const attempt = process.env.CI_PROBE_ATTEMPT;
assert(['1', '2'].includes(attempt), 'Explicit hosted control attempt required');
assert(process.env.KAIRO_EVIDENCE_DIR, 'Gate evidence directory required');
mkdirSync(process.env.KAIRO_EVIDENCE_DIR, { recursive: true });
writeFileSync(
  join(process.env.KAIRO_EVIDENCE_DIR, 'probe.json'),
  JSON.stringify(
    {
      attempt,
      jobId: process.env.CI_JOB_ID,
      runner: process.env.RUNNER_NAME,
      sha: process.env.GITHUB_SHA,
      passed: attempt === '2',
    },
    null,
    2,
  ) + '\n',
);
assert.equal(attempt, '2', 'Controlled hosted fail-once probe');
