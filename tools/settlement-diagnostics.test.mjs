import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as adapter from './footprint-support.mjs';
import { parseOwnedClosure as frozenPredicate } from '../../footprint-keep-all-02/tools/footprint-support.mjs';
import { snapshotGate, finalizeGateFootprint } from './disk-retention.mjs';

// OS results are injected; this file never invokes lsof, ps, a browser or FULL.
const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');
const cleanLsof = () => ({ status: 1, stdout: '', stderr: '', signal: null });
const cleanPs = () => ({ status: 0, stdout: '1 launchd\n', stderr: '', signal: null });
const options = { encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 ** 2 };
const err = code => Object.assign(new Error(`failure: ${code}`), { code, errno: -1, syscall: 'spawnSync' });
function probe(api = adapter, lsof = cleanLsof(), ps = cleanPs(), directory = root) {
  const calls = [], ticks = [10, 17, 30, 41];
  const result = api.checkOwnedClosure(directory, (command, args, opts) => {
    calls.push({ command, args, options: { ...opts } });
    const value = calls.length === 1 ? lsof : ps;
    if (typeof value === 'function') return value();
    return value;
  }, () => ticks.shift());
  assert.equal(calls.length, 2, 'one invocation per command, no retry');
  assert.deepEqual(calls.map(c => c.command), ['/usr/sbin/lsof', '/bin/ps']);
  assert.deepEqual(calls[0].args, ['-nP', '-Fpn', '+D', directory]);
  assert.deepEqual(calls[1].args, ['-axo', 'pid=,command=']);
  for (const call of calls) assert.deepEqual(call.options, options, 'frozen spawnSync options, no stderr suppression');
  assert.equal(result.commands.lsof.elapsedMs, 7); assert.equal(result.commands.ps.elapsedMs, 11);
  assert(Buffer.byteLength(JSON.stringify(result)) <= 24 * 1024);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result, 'complete JSON round trip');
  return result;
}
test('RS5 adapter preserves options, clean-no-match, real timestamps and individual elapsed values', () => {
  const result = probe(); assert.equal(result.closed, true);
  assert.equal(result.commands.lsof.primary, 'clean-no-match');
  assert.equal(result.commands.ps.primary, 'clean-no-match');
  for (const command of Object.values(result.commands)) {
    assert(Number.isFinite(Date.parse(command.startedAt))); assert(Number.isFinite(Date.parse(command.completedAt)));
    assert.equal(command.timeoutMs, 15000); assert.equal(command.encoding, 'utf8');
  }
});
test('RS2 adapter distinguishes warnings, errors, timeout and signal without dropping concurrent causes', () => {
  const cases = [
    [{ stderr: 'cannot stat' }, 'warning'], [{ error: err('ENOENT') }, 'execution-failure'],
    [{ status: null, error: err('ETIMEDOUT'), signal: 'SIGTERM', stderr: 'partial warning' }, 'timeout'],
    [{ status: null, signal: 'SIGTERM' }, 'signal'], [{ error: err('ENOBUFS') }, 'execution-failure'],
    [{ status: 2 }, 'execution-failure'], [{ status: undefined }, 'execution-failure'],
    [{ error: { code: 'FUTURE', context: { circular: null } } }, 'execution-failure'],
  ];
  for (const kind of ['lsof', 'ps']) for (const [change, primary] of cases) {
    const value = { ...(kind === 'lsof' ? cleanLsof() : cleanPs()), ...change };
    const result = probe(adapter, kind === 'lsof' ? value : cleanLsof(), kind === 'ps' ? value : cleanPs());
    assert.equal(result.closed, false); assert.equal(result.commands[kind].primary, primary);
    assert(result.reasons.includes(kind === 'lsof' ? 'lsof-unverified' : 'process-list-unverified'));
    if (change.error) assert.equal(result.commands[kind].error.code, change.error.code);
    if (primary === 'timeout') for (const cause of ['timeout', 'signal', 'execution-failure', 'warning'])
      assert(result.commands[kind].observedCauses.includes(cause));
  }
  const thrown = probe(adapter, () => { throw err('EACCES'); });
  assert.equal(thrown.closed, false); assert.equal(thrown.commands.lsof.invocationThrew, true);
  assert.equal(thrown.commands.lsof.error.message, 'failure: EACCES');
  assert.equal(probe(adapter, undefined).closed, true, 'default parameter is a clean fixture, not a missing-result probe');
  assert.equal(probe(adapter, () => undefined).closed, false, 'missing invocation result rejected');
});
test('RS5 closed/reasons exactly match the frozen predicate before truncation (both command axes)', () => {
  const variants = [
    {}, { status: undefined }, { status: null }, { status: 0 }, { status: 1 }, { status: 2 },
    { stdout: 'p12\nn/open' }, { stdout: '  \n' }, { stderr: 'warning' }, { stderr: '  \n' },
    { error: err('ETIMEDOUT'), signal: 'SIGTERM' }, { error: err('ENOENT') }, { signal: 'SIGKILL' },
    { stdout: `42 Chrome --user-data-dir=${root}/profile\n` },
  ];
  for (const left of variants) for (const right of variants) {
    const lsof = { ...cleanLsof(), ...left }, ps = { ...cleanPs(), ...right };
    const old = frozenPredicate(root, lsof, ps), current = adapter.parseOwnedClosure(root, lsof, ps);
    assert.equal(current.closed, old.closed); assert.deepEqual(current.reasons, old.reasons);
  }
});
test('RS5 complete observation fits 24 KiB with thousands of matching PIDs, huge escaped streams and errors', () => {
  const text = ('雨\u0000"\\\n😀').repeat(10000);
  const warning = `${' '.repeat(12000)}late warning`;
  const ps = { ...cleanPs(), stdout: text + '\n' + Array.from({ length: 5000 }, (_, i) => `${i + 10} ${root}/profile`).join('\n'), stderr: warning };
  const error = Object.assign(new Error(text), { code: text, syscall: text, errno: text, unusualField: {} });
  const result = probe(adapter, { ...cleanLsof(), stdout: text, stderr: warning, error }, ps);
  assert.equal(result.closed, false); assert.equal(result.matchingProcessCount, 5000);
  assert.equal(result.matchingProcessIds.length, 64); assert.equal(result.matchingProcessIdsOmitted, 4936);
  assert(result.commands.ps.observedCauses.includes('open-handles')); assert(result.commands.ps.observedCauses.includes('warning'));
  assert(result.commands.lsof.error.fieldsTruncated.includes('message'));
  assert.equal(result.commands.lsof.error.unrepresentedFieldCount, 1);
  for (const [value, expected] of [[result.commands.lsof.stdout, text], [result.commands.ps.stderr, warning]]) {
    assert(value.truncated); assert.equal(value.capturedBytes, Buffer.byteLength(expected));
    assert.equal(value.sampleBytes + value.omittedBytes, value.capturedBytes);
    assert.equal(value.sha256, createHash('sha256').update(expected).digest('hex'));
    assert.match(value.byteBasis, /decoded text/);
  }
  const longId = probe(adapter, cleanLsof(), { ...cleanPs(), stdout: `${'7'.repeat(10000)} ${root}` });
  assert.equal(longId.matchingProcessIdsTextTruncated, true);
});
test('RS5 long elapsed time alone is not labelled timeout', () => {
  const times = [0, 900000, 900001, 900002];
  const result = adapter.checkOwnedClosure(root, command => command.endsWith('lsof') ? cleanLsof() : cleanPs(), () => times.shift());
  assert.equal(result.commands.lsof.elapsedMs, 900000); assert.equal(result.commands.lsof.primary, 'clean-no-match');
  assert.equal(result.closed, true);
});
test('RS1/RS5 adapter diagnostics survive real settlement without exceeding closureSummary cap', async () => {
  const scratch = fileURLToPath(new URL('../checks/', import.meta.url)); mkdirSync(scratch, { recursive: true });
  const gate = await fs.mkdtemp(join(scratch, 'step1-')); let succeeded = false;
  try {
    const before = await snapshotGate(gate);
    const battery = { kind: 'kairo-required-battery', status: 'passed', exitCode: 0, completedAt: '2026-10-25T00:00:00Z',
      gates: [{ name: 'synthetic', status: 'passed', exitCode: 0, processExitCode: 0 }] };
    await fs.writeFile(join(gate, 'battery.json'), JSON.stringify(battery));
    const ledger = await finalizeGateFootprint({ root: gate, before, passed: true, evidencePaths: ['battery.json'], retentionMode: 'keep-all',
      closureCheck: () => probe(adapter, cleanLsof(), { ...cleanPs(), stdout: Array.from({ length: 5000 }, (_, i) => `${i} ${gate}/profile`).join('\n') }, gate) });
    assert.equal(ledger.status, 'blocked'); assert.equal(ledger.reason, 'gate-not-closed');
    assert.equal(ledger.closure.matchingProcessCount, 5000); assert.equal(ledger.closure.commands.ps.primary, 'open-handles');
    assert.equal(ledger.confirmedRemovedBytes, 0); assert.deepEqual(ledger.removedFiles, []);
    assert.deepEqual(JSON.parse(await fs.readFile(ledger.ledgerPath, 'utf8')).closure, ledger.closure);
    succeeded = true;
  } finally { if (succeeded) await fs.rm(gate, { recursive: true }); }
});
const source = readFileSync(new URL('./footprint-support.mjs', import.meta.url), 'utf8');
async function mutant(needle, replacement) {
  assert.equal(source.split(needle).length - 1, 1, 'mutant hits exactly once');
  return import(`data:text/javascript;base64,${Buffer.from(source.replace(needle, replacement)).toString('base64')}`);
}
test('RS2 required mutants are killed: lsof-only closure, stderr ignore, encoding, missing status, thrown invocation', async () => {
  const wrongClosed = await mutant('closed: reasons.length === 0', 'closed: lsof.status === 1');
  assert.throws(() => assert.equal(probe(wrongClosed, cleanLsof(), { ...cleanPs(), stdout: `9 ${root}/profile` }).closed, false), { code: 'ERR_ASSERTION' });
  for (const replacement of ["encoding: 'buffer', timeout: 15000", "encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000"]) {
    const changedOptions = await mutant("encoding: 'utf8', timeout: 15000", replacement);
    assert.throws(() => probe(changedOptions), /frozen spawnSync options/);
  }
  const missingAsOne = await mutant('result = run(command, args, options);', 'result = run(command, args, options); if (result && result.status === undefined) result = { ...result, status: 1 };');
  assert.throws(() => assert.equal(probe(missingAsOne, { stdout: '', stderr: '' }).closed, false), { code: 'ERR_ASSERTION' });
  const thrownAsOne = await mutant('result = { error, status: null, signal: null, invocationThrew: true };', "result = { status: 1, stdout: '', stderr: '' };");
  assert.throws(() => assert.equal(probe(thrownAsOne, () => { throw err('EACCES'); }).closed, false), { code: 'ERR_ASSERTION' });
});
