import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync, lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Ambient diagnostics/faults never select an acceptance schedule. Mutant children
// receive their explicit scope from their own strict parent after this boundary.
export const NARROWING_ENV = Object.freeze([
  'SENSE_TRUTH_ONLY',
  'SENSE_VH_CASES',
  'SENSE_VH_CONTROL',
  'SENSE_VH_NONCE',
  'SENSE_VH_CONTROLS',
  'READING_TRUTH_ONLY',
  'READING_TRUTH_PAST_F0',
  'READING_TRUTH_SWEEP_IDS',
  'SWEEP_WORLDS',
  'SWEEP_STATES',
  'KAIRO_SWEEP_MODE',
  'KAIRO_SWEEP_NEGATIVE',
  'COMB_NEGATIVE',
  'SPEAK_CASES',
  'SPEAK_NEGATIVES',
  'SPEAK_FAULT',
  'SPEAK_BREAK_SETUP',
  'SPEAK_NEGATIVES_BREAK_SETUP',
  'SPEAK_OVERLAY_SOURCE',
  'SPEAK_RUN_NONCE',
  'SPEAK_RUN_PHASE',
  'GUIDED_FAULT',
  'GUIDED_STANDALONE',
  'D23_ASSESSMENT_STAGE',
  'KAIRO_QUESTION_VIEW_CASES',
  'KAIRO_QUESTION_STAGED_SOURCE',
  'KAIRO_EXPECT_SOURCE_LOSS',
  'KAIRO_PRACTICE_OFFLINE_FAULT',
  'KAIRO_PUBLISHER_OFFLINE_FAULT',
  'KAIRO_PERSONAL_READING_SOURCE',
  'KAIRO_PLAYWRIGHT_MODULE',
  'KAIRO_PREFETCH_RUNTIME_SOURCE',
  'KAIRO_CORRIDOR_SOURCE',
  'KAIRO_RECORD_SOURCE',
  'RECORD_DEPTH_NONCE',
  'KAIRO_SW_SOURCE',
  'KAIRO_NATIVE_HELPER_STAGE_SOURCE',
  'KAIRO_SOURCE_VIEWPORT',
  'KAIRO_LISTENING_VIEWPORT',
  'KAIRO_TRANSCRIPT_VIEWPORT',
  'KAIRO_SENTENCE_VIEWPORT',
  'KAIRO_SENTENCE_FEEDBACK_VIEWPORT',
  'KAIRO_SENTENCE_DRAFT_VIEWPORT',
  'KAIRO_BUNDLED_PRACTICE_VIEWPORT',
  'KAIRO_BUNDLED_LISTENING_VIEWPORT',
  'KAIRO_KANJI_VIEWPORT',
  'KAIRO_LATER_VIEWPORT',
  'KAIRO_TUTOR_VIEWPORT',
  'KAIRO_LATER_PRIOR_ROOT',
  'KAIRO_LATER_PRIOR_ORIGIN',
  'KAIRO_EXPECT_APPROVAL_MISSING',
  'GUIDED_MOMENTS',
  'GUIDED_VIEWPORTS',
  'GUIDED_PARTS',
  'KAIRO_FILE_VIEWPORT',
  'KAIRO_SKY_NEGATIVE',
  'KAIRO_RECORD_HINT_ONLY',
  'PERSONAL_BROWSERS',
  'PERSONAL_CHROMIUM',
  'KAIRO_OVERFLOW_PROBE',
  'KAIRO_GRADE_DIAGNOSTICS',
  'KAIRO_ASSESSMENT_CLICK_DIAGNOSTICS',
  'KAIRO_PRIVATE_PACK',
  'KAIRO_ASSESSMENT_SITE_DIR',
  'KAIRO_ASSESSMENT_SITE_SHA256',
  'KOTOBA_ONLY',
  'FOUNDATION_ONLY',
  'EXPERIENCE_ONLY',
  'VITEST_SEGFAULT_RETRY',
  'VITEST_MAX_THREADS',
  'PLAYWRIGHT_GREP',
  'PYTEST_PLUGINS',
  'NODE_OPTIONS',
  'NODE_TEST_CONTEXT',
  'NODE_TEST_NAME_PATTERN',
  'PYTEST_ADDOPTS',
]);
export function acceptanceEnvironment(parent, declared = {}) {
  const env = { ...parent };
  for (const name of NARROWING_ENV) delete env[name];
  // A declared full gate is the only engine authority, never the operator shell.
  delete env.KAIRO_BROWSER;
  delete env.PERSONAL_HOST_BROWSER;
  return { ...env, KAIRO_BROWSER: 'chromium', ...declared };
}
export function exactIds(expected, observed, label = 'cases') {
  assert(Array.isArray(expected) && expected.length, `${label}: empty expected roster`);
  assert(Array.isArray(observed) && observed.length, `${label}: empty observed roster`);
  assert.equal(new Set(expected).size, expected.length, `${label}: duplicate expected ID`);
  assert.equal(new Set(observed).size, observed.length, `${label}: duplicate observed ID`);
  assert.deepEqual([...observed].sort(), [...expected].sort(), `${label}: missing or extra ID`);
}
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function sourceSnapshot(root) {
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  let head;
  try {
    // A disposable fixture directory can sit inside an unrelated ancestor checkout.
    // Only the checkout rooted at the supplied path can supply its source identity.
    if (realpathSync(git('rev-parse', '--show-toplevel').trim()) !== realpathSync(root))
      return null;
    head = git('rev-parse', 'HEAD').trim();
  } catch {
    return null;
  }
  const status = git('status', '--porcelain=v1', '-z');
  const diff = git('diff', '--binary', 'HEAD', '--');
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z')
    .split('\0')
    .filter(Boolean)
    .map((file) => [file, digest(readFileSync(resolve(root, file)))]);
  return {
    head,
    statusSha256: digest(status),
    diffSha256: digest(diff),
    untrackedSha256: digest(JSON.stringify(untracked)),
  };
}
export function requireGateAttemptEvidence(gate, { gitSha, artifactSha256 } = {}) {
  const r = gate.evidenceReceipt;
  assert(
    r && r.kind === 'bunki-gate-evidence' && r.schemaVersion === 1,
    'Required per-gate evidence receipt missing',
  );
  assert.equal(r.name, gate.name);
  assert.equal(r.runId, gate.runId);
  assert(typeof r.runId === 'string' && r.runId.length > 0, 'Gate nonce missing');
  assert.equal(
    gate.evidenceReceiptSha256,
    digest(JSON.stringify(r)),
    'Evidence transport digest differs',
  );
  assert.equal(r.gitSha, gitSha);
  assert.equal(r.artifactSha256, artifactSha256);
  assert.equal(r.fullAcceptance, true);
  assert(
    r.proof && r.proof.kind !== 'process-probe',
    'Test-only process fixture cannot admit a real gate',
  );
  if (r.proof.kind === 'command-check') {
    assert(r.proof.obligation?.completed && r.proof.obligation.inputs?.length > 0);
    assert.equal(r.proof.obligation.processExitCode, 0);
  } else {
    assert(r.proof.receipts?.length > 0, 'No actual producer/framework receipt');
    for (const row of r.proof.receipts)
      assert(
        row.path && row.bytes > 0 && /^[a-f0-9]{64}$/u.test(row.sha256),
        'Invalid producer receipt binding',
      );
  }
}
export function readFreshReceipt(path, { startedAt, runId, requireNonce = false } = {}) {
  assert(existsSync(path), `Required receipt missing: ${path}`);
  assert(!lstatSync(path).isSymbolicLink(), `Receipt symlink rejected: ${path}`);
  const stat = statSync(path);
  assert(stat.isFile() && stat.size > 0, `Empty/non-file receipt: ${path}`);
  assert(stat.mtimeMs >= Date.parse(startedAt), `Stale receipt: ${path}`);
  const bytes = readFileSync(path);
  const value = JSON.parse(bytes);
  if (requireNonce || value?.runId !== undefined)
    assert.equal(value.runId, runId, 'Receipt run nonce differs');
  return { value, path, sha256: digest(bytes), bytes: bytes.length };
}
export function requireNodeSuite(receipt, files, root) {
  assert.equal(receipt.kind, 'bunki-node-test-suite');
  assert.equal(receipt.fullAcceptance, true, 'Node suite is incomplete/diagnostic');
  const expected = files.map((file) => resolve(root, file));
  exactIds(
    expected,
    receipt.files.map((row) => row.file),
    'Node test files',
  );
  for (const row of receipt.files) {
    assert.equal(row.sha256, digest(readFileSync(row.file)), 'Node test source changed');
    assert.equal(row.summary.success, true);
    const counts = row.summary.counts;
    assert(counts.tests > 0 && counts.passed === counts.tests, 'Node file has no complete tests');
    for (const field of ['failed', 'cancelled', 'skipped', 'todo'])
      assert.equal(counts[field], 0, `Node ${field}`);
  }
  assert(receipt.tests.length > 0, 'No named Node assertions completed');
  const signature = (row) => JSON.stringify([resolve(row.file), row.name, row.nesting, row.line]);
  assert(receipt.scheduled?.length > 0, 'No framework collection evidence');
  assert.deepEqual(
    receipt.tests.map(signature).sort(),
    receipt.scheduled.map(signature).sort(),
    'Collected Node test did not complete exactly once',
  );
  for (const row of receipt.files) {
    const observed = receipt.tests.filter((test) => resolve(test.file) === row.file);
    assert.equal(
      observed.length,
      row.summary.counts.tests + (row.summary.counts.suites || 0),
      'Named completion count differs from framework summary',
    );
  }
  assert(
    receipt.tests.every((row) => row.status === 'passed' && !row.skip && !row.todo),
    'Node test not passed',
  );
  assert.equal(receipt.summary.success, true);
  assert.equal(receipt.summary.counts.passed, receipt.summary.counts.tests);
  for (const field of ['failed', 'cancelled', 'skipped', 'todo'])
    assert.equal(receipt.summary.counts[field], 0);
}
