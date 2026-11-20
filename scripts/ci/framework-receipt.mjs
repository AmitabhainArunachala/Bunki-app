import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { digest, exactIds } from './verification-admission.mjs';

export function newFrameworkReceipt(framework) {
  return {
    schemaVersion: 1,
    kind: 'bunki-framework-suite',
    framework,
    runId: process.env.KAIRO_GATE_RUN_ID,
    startedAt: new Date().toISOString(),
    scheduledFiles: [],
    files: [],
    collected: [],
    completed: [],
    errors: [],
    fullAcceptance: false,
  };
}
export function requireFrameworkReceipt(r, expectedFramework) {
  assert(['vitest', 'playwright', 'pytest'].includes(r.framework), 'Unknown framework');
  if (expectedFramework)
    assert.equal(r.framework, expectedFramework, 'Wrong framework for this gate');
  assert(
    typeof r.version === 'string' && /^\d+\.\d+/u.test(r.version),
    'Actual framework version missing',
  );
  assert.equal(r.kind, 'bunki-framework-suite');
  assert.equal(r.fullAcceptance, true, 'Framework run is incomplete');
  assert.equal(r.errors.length, 0, 'Framework errors');
  exactIds(
    r.scheduledFiles,
    r.files.map((f) => f.path),
    'Framework files',
  );
  for (const f of r.files)
    assert.equal(f.sha256, digest(readFileSync(f.path)), 'Framework file changed');
  exactIds(
    r.collected.map((t) => t.id),
    r.completed.map((t) => t.id),
    'Framework tests',
  );
  assert(
    r.completed.every((t) => t.status === 'passed' && !t.retry && !t.expectedFailure),
    'Skipped, failed, retried or expected-failure test',
  );
  assert.equal(r.filtered, false, 'Filtered framework run');
}
export function finishFrameworkReceipt(r) {
  r.completedAt = new Date().toISOString();
  r.fullAcceptance = true;
  try {
    requireFrameworkReceipt(r);
  } catch (error) {
    r.fullAcceptance = false;
    r.errors.push(String(error.message));
  }
  const out = process.env.KAIRO_FRAMEWORK_RECEIPT;
  assert(out, 'Required KAIRO_FRAMEWORK_RECEIPT missing');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(r, null, 2) + '\n');
  return r.fullAcceptance;
}
export const fileEvidence = (path) => ({ path, sha256: digest(readFileSync(path)) });
