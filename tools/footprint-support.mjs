import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

export const TOOL_FILES = Object.freeze([
  'run-full-r1.mjs', 'disk-retention.mjs', 'footprint-support.mjs', 'native-policy.json',
]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function currentFootprintPins(tools, root) {
  const policy = JSON.parse(readFileSync(join(tools, 'native-policy.json')));
  assert.equal(policy.kind, 'bunki-full-footprint-native-policy');
  assert.equal(policy.schemaVersion, 1);
  const actualNative = Object.fromEntries(Object.keys(policy.nativeSourcePins).map(path =>
    [path, sha(readFileSync(join(root, path)))]));
  assert.deepEqual(actualNative, policy.nativeSourcePins,
    'Footprint native changes must be integrated and source-reviewed before this wrapper runs');
  return {
    tools: Object.fromEntries(TOOL_FILES.map(file => [file, sha(readFileSync(join(tools, file)))])),
    native: actualNative,
  };
}
export function requireFootprintApproval(value, { pins, head, artifact }) {
  assert.equal(value?.kind, 'bunki-full-footprint-review');
  assert.equal(value?.status, 'approved', 'Independent W2 footprint approval required');
  assert.equal(value.sourceHead, head);
  assert.equal(value.artifactSha256, artifact);
  assert(typeof value.reviewer === 'string' && value.reviewer.trim());
  assert(Number.isFinite(Date.parse(value.reviewedAt)));
  assert.deepEqual(value.pins, pins, 'Footprint tooling/source differs from the reviewed pins');
  assert.equal(value.scope, 'final-pass-traces-and-owned-profiles-only');
  return true;
}

// Keep one detailed journal per attempt; progress.json must not duplicate every
// profile file inventory each time another gate completes.
export function summarizeFootprint(ledger, pin) {
  return {
    status: ledger.status, reason: ledger.reason,
    bytesWritten: ledger.bytesWritten, bytesWrittenSemantics: ledger.bytesWrittenSemantics,
    bytesBeforeCleanup: ledger.bytesBeforeCleanup, bytesKept: ledger.bytesKept,
    bytesRemoved: ledger.bytesRemoved, confirmedRemovedBytes: ledger.confirmedRemovedBytes,
    journalOverheadBytes: ledger.journalOverheadBytes, totalBytesKept: ledger.totalBytesKept,
    removedFiles: ledger.removedFiles?.length ?? 0, removedDirectories: ledger.removedDirs?.length ?? 0,
    retainedCandidates: ledger.keptCandidates?.length ?? 0,
    ledger: pin(ledger.ledgerPath), inventory: pin(ledger.inventoryPath), operations: pin(ledger.operationsPath),
  };
}

// Diagnostic limits apply to the entire returned value, including legacy fields.
export const CLOSURE_DIAGNOSTIC_BYTES = 24 * 1024;
const jsonBytes = value => Buffer.byteLength(JSON.stringify(value));
function clipped(value, budget) {
  const text = String(value ?? '');
  if (jsonBytes(text) <= budget) return text;
  let low = 0, high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (jsonBytes(text.slice(0, mid)) <= budget) low = mid; else high = mid - 1;
  }
  // Do not end the retained sample halfway through a UTF-16 surrogate pair.
  if (low && /[\uD800-\uDBFF]/.test(text[low - 1])) low--;
  return text.slice(0, low);
}
function outputDiagnostic(value) {
  const text = String(value || ''), sample = clipped(text, 2048);
  const capturedBytes = Buffer.byteLength(text), sampleBytes = Buffer.byteLength(sample);
  return { text: sample, capturedBytes, sampleBytes, omittedBytes: capturedBytes - sampleBytes,
    truncated: sample !== text, sha256: sha(text),
    byteBasis: 'UTF-8 re-encoding of captured decoded text; excludes uncaptured OS output' };
}
function errorDiagnostic(error) {
  if (!error) return null;
  const budgets = { name: 96, code: 96, errno: 96, syscall: 128, message: 768 };
  const result = { valueType: typeof error, fieldsTruncated: [] };
  for (const [key, budget] of Object.entries(budgets)) {
    const value = error?.[key];
    result[key] = value == null ? null : typeof value === 'number' && Number.isFinite(value) ? value : clipped(value, budget);
    if (value != null && String(result[key]) !== String(value)) result.fieldsTruncated.push(key);
  }
  if (typeof error !== 'object' && typeof error !== 'function') result.message = clipped(error, 768);
  const unknown = Object.getOwnPropertyNames(Object(error)).filter(key => !Object.hasOwn(budgets, key) && key !== 'stack');
  result.unrepresentedFieldCount = unknown.length;
  result.unrepresentedFields = unknown.slice(0, 4).map(key => clipped(key, 64));
  assert(jsonBytes(result) <= 2048, 'bounded command error record');
  return result;
}
function commandDiagnostic(kind, value, matchingCount) {
  const causes = [];
  if (value.error?.code === 'ETIMEDOUT') causes.push('timeout');
  if (value.signal) causes.push('signal');
  if (value.error || value.invocationThrew || !(kind === 'lsof' ? [0, 1].includes(value.status) : value.status === 0)) causes.push('execution-failure');
  if (String(value.stderr || '').trim()) causes.push('warning');
  const occupied = kind === 'lsof' ? value.status === 0 || !!String(value.stdout || '').trim() : matchingCount > 0;
  if (occupied) causes.push('open-handles');
  if (!causes.length) causes.push('clean-no-match');
  return { primary: causes[0], observedCauses: causes,
    occupancy: occupied ? kind === 'lsof' ? 'owned-files-open' : 'live-owned-path-process' : null,
    status: Number.isFinite(value.status) ? value.status : null, statusProvided: value.status !== undefined,
    signal: value.signal ? clipped(value.signal, 128) : null, invocationThrew: value.invocationThrew === true,
    error: errorDiagnostic(value.error), stdout: outputDiagnostic(value.stdout), stderr: outputDiagnostic(value.stderr),
    outputCaptureFailure: value.error?.code === 'ENOBUFS' ? 'maxBuffer-exceeded; uncaptured bytes unknown' : null };
}
function boundClosure(value) {
  // The normal caps fit below 24 KiB. This fallback also covers very long command
  // metadata; it never changes the full-result predicate or removes cause flags.
  if (jsonBytes(value) > CLOSURE_DIAGNOSTIC_BYTES) {
    for (const command of Object.values(value.commands)) {
      for (const key of ['stdout', 'stderr']) {
        const stream = command[key]; stream.text = ''; stream.sampleBytes = 0;
        stream.omittedBytes = stream.capturedBytes; stream.truncated = stream.capturedBytes > 0;
      }
    }
    value.diagnosticSamplesElided = true;
  }
  assert(jsonBytes(value) <= CLOSURE_DIAGNOSTIC_BYTES, 'complete closure diagnostic exceeds bound');
  return value;
}

// Evaluate the frozen closure predicate on full results BEFORE diagnostic sampling.
// Neither lsof's clean-no-match alone nor a zero child exit proves browser closure.
export function parseOwnedClosure(root, lsof, ps) {
  const reasons = [];
  if (lsof.error || lsof.signal || ![0, 1].includes(lsof.status)
      || String(lsof.stderr || '').trim()) reasons.push('lsof-unverified');
  if (lsof.status === 0 || String(lsof.stdout || '').trim()) reasons.push('owned-files-open');
  if (ps.error || ps.signal || ps.status !== 0 || String(ps.stderr || '').trim()) reasons.push('process-list-unverified');
  const matching = String(ps.stdout || '').split('\n').filter(line => line.includes(root));
  if (matching.length) reasons.push('owned-path-in-live-process-command');
  const ids = matching.slice(0, 64).map(line => line.trim().split(/\s+/, 1)[0]);
  const matchingProcessIds = ids.map(id => clipped(id, 96));
  return boundClosure({ closed: reasons.length === 0, reasons,
    lsofExit: Number.isFinite(lsof.status) ? lsof.status : null,
    processListExit: Number.isFinite(ps.status) ? ps.status : null,
    matchingProcessIds, matchingProcessCount: matching.length,
    matchingProcessIdsOmitted: matching.length - ids.length,
    matchingProcessIdsTextTruncated: ids.some((id, i) => id !== matchingProcessIds[i]),
    commands: { lsof: commandDiagnostic('lsof', lsof, 0), ps: commandDiagnostic('ps', ps, matching.length) } });
}
export function checkOwnedClosure(root, run = spawnSync, clock = () => performance.now()) {
  root = realpathSync(root);
  const options = { encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 ** 2 };
  function invoke(command, args) {
    const startedAt = new Date().toISOString(), start = clock();
    let result;
    try { result = run(command, args, options); }
    catch (error) { result = { error, status: null, signal: null, invocationThrew: true }; }
    // Never turn a missing result or status into lsof's clean exit 1.
    if (!result || typeof result !== 'object') result = { status: null, error: new Error('Command returned no result object') };
    const elapsedMs = clock() - start;
    return { result, timing: { executable: command, args: args.map(arg => clipped(arg, 1024)),
      argumentsTruncated: args.some(arg => clipped(arg, 1024) !== arg), startedAt, completedAt: new Date().toISOString(),
      elapsedMs, timeoutMs: options.timeout, maxBufferBytes: options.maxBuffer, encoding: options.encoding } };
  }
  const lsof = invoke('/usr/sbin/lsof', ['-nP', '-Fpn', '+D', root]);
  const ps = invoke('/bin/ps', ['-axo', 'pid=,command=']);
  const observation = parseOwnedClosure(root, lsof.result, ps.result);
  Object.assign(observation.commands.lsof, lsof.timing);
  Object.assign(observation.commands.ps, ps.timing);
  return boundClosure({ at: new Date().toISOString(), ...observation });
}
