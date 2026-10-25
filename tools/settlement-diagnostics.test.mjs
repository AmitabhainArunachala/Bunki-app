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

// STEP 2 runs the production native validator, retained-pin verifier, start(),
// admission decision and scheduler loop. Only native execution/OS observations,
// clock/resources, frozen-environment observation and named faults are injected.
const { createRequire: step2CreateRequire } = await import('node:module');
const step2Fs = await import('node:fs');
const step2Path = await import('node:path');
const step2NativeRoot = '/Users/dhyana/worktrees/Bunki-app/r2-integration_20261021';
const step2Ts = step2CreateRequire(join(step2NativeRoot, 'package.json'))('typescript');
const { requireGateAttemptEvidence: step2RequireEvidence } = await import(
  new URL('scripts/ci/verification-admission.mjs', `file://${step2NativeRoot}/`).href);
const step2Runner = readFileSync(new URL('./run-full-r1.mjs', import.meta.url), 'utf8');
function step2Tree(text) {
  const ast = step2Ts.createSourceFile('fixture-source.mjs', text, step2Ts.ScriptTarget.Latest, true);
  assert.equal(ast.parseDiagnostics.length, 0); return ast;
}
function step2Declaration(text, name) {
  const ast = step2Tree(text), found = [];
  function visit(node) {
    if ((step2Ts.isFunctionDeclaration(node) || step2Ts.isVariableDeclaration(node)) && node.name?.getText(ast) === name) found.push(node);
    step2Ts.forEachChild(node, visit);
  }
  visit(ast); assert.equal(found.length, 1, `exactly one actual ${name} declaration`);
  const node = found[0], body = node.getText(ast).replace(/^export\s+/, '');
  return step2Ts.isVariableDeclaration(node) ? `const ${body};` : body;
}
function step2Scheduler() {
  const ast = step2Tree(step2Runner), loops = [];
  function visit(node) {
    if (step2Ts.isWhileStatement(node) && node.getText(ast).includes('const stop = stopRequested();')) loops.push(node);
    step2Ts.forEachChild(node, visit);
  }
  visit(ast); assert.equal(loops.length, 1, 'one production dispatch loop');
  const guarded = loops[0].parent.parent;
  assert(step2Ts.isTryStatement(guarded), 'keep actual scheduler catch/drain');
  const statements = [...guarded.parent.statements], index = statements.indexOf(guarded);
  const tail = statements.slice(index + 1, index + 4);
  assert(tail[0].getText(ast).includes('Scheduler exited with an active native gate'));
  assert(tail[2].getText(ast).includes('progress.schedulerFailures = failures'));
  return [guarded, ...tail].map(node => node.getText(ast)).join('\n');
}
const step2ShardDeclaration = step2Declaration(readFileSync(join(step2NativeRoot, 'scripts/ci/battery.mjs'), 'utf8'), 'gateForShard');
const step2Declarations = ['sha', 'pin', 'json', 'writeJson', 'persist', 'event', 'tail', 'redDetails', 'knownVoice',
  'chooseWork', 'resourcesReady', 'normalized', 'verifyPin', 'validateNative', 'updateActive', 'start']
  .map(name => step2Declaration(step2Runner, name)).join('\n');
// Explicit free-identifier manifest: no Proxy, with(), implicit fallback or
// unconditional validation stub can turn an omitted dependency into a block.
const step2Bindings = [
  'assert', 'createHash', 'readFileSync', 'statSync', 'writeFileSync', 'renameSync', 'appendFileSync',
  'existsSync', 'mkdirSync', 'openSync', 'readSync', 'closeSync', 'join', 'relative', 'isAbsolute',
  'out', 'root', 'site', 'progress', 'active', 'failures', 'PHASES', 'LIMIT', 'contract', 'retentionMode',
  'now', 'performance', 'machine', 'delay', 'stopRequested', 'descriptors', 'artifactEnv',
  'assertFrozen', 'runGates', 'snapshotGate', 'finalizeGateFootprint', 'checkOwnedClosure',
  'summarizeFootprint', 'footprintBlockCause', 'recordSettlementReportingFailure',
  'requireGateAttemptEvidence', 'frozenSource', 'usedNonces',
];
const step2Execute = new Function(...step2Bindings, `"use strict"; ${step2ShardDeclaration}\n${step2Declarations}
  const planOut = join(out, '__descriptor_paths_only__'), planned = descriptors(planOut);
  ${step2Declaration(step2Runner, 'plannedByName')}
  return (async () => { ${step2Scheduler()} })();`);
const step2Hash = bytes => createHash('sha256').update(bytes).digest('hex');
const step2Fault = name => Object.assign(new Error(`injected ${name}`), { code: `FIXTURE_${name.toUpperCase().replaceAll('-', '_')}` });

async function step2Fixture(config, inspect) {
  const checks = fileURLToPath(new URL('../checks/', import.meta.url));
  mkdirSync(checks, { recursive: true });
  const directory = await fs.mkdtemp(join(checks, 'step2-'));
  let succeeded = false;
  const head = 'a'.repeat(40), artifact = 'b'.repeat(64), site = join(directory, 'fixture-site');
  const frozenSource = { sha: head, dirty: false, files: [] };
  const progress = { schemaVersion: 1, kind: 'bunki-full-battery-orchestration', status: 'ready',
    expectedHead: head, expectedArtifact: artifact, stop: null, settlementBlock: null, active: [],
    gates: [{ name: 'fixture-first', phase: 'A', outcome: 'pending', attempts: [] },
      { name: 'fixture-next', phase: 'B', outcome: 'pending', attempts: [] },
      ...(config.lateStop ? [{ name: 'fixture-hold', phase: 'C', outcome: 'pending', attempts: [] }] : [])] };
  const state = { directory, progress, active: new Map(), failures: [], launches: [], events: [], ledgers: [],
    finalizeCalls: [], closureCalls: [], frozenChecks: 0, markerWrites: 0, faultHits: 0 };
  const operator = { kind: 'operator-stop-after-current-gates', signal: 'SIGTERM', at: '2026-10-25T00:00:02.000Z' };
  let ticks = 0, observedOperator = null, releaseHold;
  const hold = new Promise(resolve => { releaseHold = resolve; });
  const resources = () => ({ load: [1, 1, 1], freeBytes: 32 * 1024 ** 3, memory: { availableBytes: 32 * 1024 ** 3 } });
  const currentSettlement = () => progress.gates[0].attempts[0]?.settlement;
  const failOnce = name => { if (config.fault === name && state.faultHits === 0) { state.faultHits++; throw step2Fault(name); } };
  const afterLedgerBeforeBlock = () => state.ledgers.length > 0 && !progress.settlementBlock;
  if (config.fault === 'serialization') progress.toJSON = () => {
    if (afterLedgerBeforeBlock()) failOnce('serialization');
    return Object.fromEntries(Object.entries(progress).filter(([key]) => key !== 'toJSON'));
  };
  const context = {
    assert, createHash, readFileSync, statSync: step2Fs.statSync,
    writeFileSync: (path, bytes) => {
      if (path === join(directory, 'progress.json.tmp')) {
        if (currentSettlement()?.stage === 'before-finalize') { state.markerWrites++; failOnce('marker'); }
        if (afterLedgerBeforeBlock()) failOnce('write');
      }
      return step2Fs.writeFileSync(path, bytes);
    },
    renameSync: step2Fs.renameSync,
    appendFileSync: (path, text) => {
      const event = JSON.parse(text); state.events.push(event);
      if (config.lateStop && event.kind === 'gate-boundary-blocked') observedOperator = operator;
      return step2Fs.appendFileSync(path, text);
    },
    existsSync: step2Fs.existsSync, mkdirSync, openSync: step2Fs.openSync, readSync: step2Fs.readSync, closeSync: step2Fs.closeSync,
    join, relative: step2Path.relative, isAbsolute: step2Path.isAbsolute,
    out: directory, root: directory, site, progress, active: state.active, failures: state.failures,
    PHASES: ['A', 'B', 'C'], LIMIT: { load1: 16, diskBytes: 8 * 1024 ** 3, memoryBytes: 8 * 1024 ** 3, pollMs: 15000 },
    contract: { dependencies: {}, globallyExclusive: [] }, retentionMode: 'keep-all',
    now: () => '2026-10-25T00:00:00.000Z', performance: { now: () => { ticks += 100; return ticks; } }, machine: resources,
    // A native completion wakes the production Promise.race. No polling timer or OS process is started.
    delay: () => new Promise(() => {}),
    stopRequested: () => { if (observedOperator) releaseHold(); return observedOperator; },
    descriptors: attemptOut => progress.gates.map(gate => ({ name: gate.name, command: ['fixture'], out: attemptOut, env: {} })),
    artifactEnv: { BUNKI_FIXTURE: '1' },
    assertFrozen: () => { state.frozenChecks++; },
    runGates: async ({ gates: [gate], out: attemptOut, source: receiptSource }) => {
      state.launches.push(gate.name);
      if (gate.name === 'fixture-hold') await hold;
      const producerPath = join(attemptOut, 'producer.json');
      await fs.writeFile(producerPath, JSON.stringify({ kind: 'fixture-producer', passed: true, name: gate.name }));
      const producerBytes = readFileSync(producerPath);
      const proof = { kind: 'producer-receipt', receipts: [{ path: producerPath, bytes: producerBytes.length, sha256: step2Hash(producerBytes) }] };
      const runId = `${gate.name}-nonce`, startedAt = '2026-10-25T00:00:00.000Z', completedAt = '2026-10-25T00:00:00.100Z';
      const evidenceReceipt = { schemaVersion: 1, kind: 'bunki-gate-evidence', name: gate.name, runId,
        gitSha: head, artifactSha256: artifact, fullAcceptance: true, proof };
      const result = { name: gate.name, runId, status: 'passed', exitCode: 0, processExitCode: 0, startedAt, completedAt, proof,
        evidenceReceipt, evidenceReceiptSha256: step2Hash(JSON.stringify(evidenceReceipt)),
        attemptReceipt: join(attemptOut, gate.name + '.attempt.json'), log: join(attemptOut, gate.name + '.log') };
      await fs.writeFile(result.attemptReceipt, JSON.stringify(evidenceReceipt));
      await fs.writeFile(result.log, 'fixture native completed\n');
      const receipt = { kind: 'kairo-required-battery', schemaVersion: 1, source: receiptSource,
        sourceBefore: frozenSource, sourceAfter: frozenSource, artifactBefore: { gitSha: head, artifactSha256: artifact },
        artifactAfter: { gitSha: head, artifactSha256: artifact }, status: 'passed', exitCode: 0, startedAt, completedAt, gates: [result] };
      if (gate.name === 'fixture-first' && config.invalidProof) result.evidenceReceiptSha256 = 'c'.repeat(64);
      await fs.writeFile(join(attemptOut, 'battery.json'), JSON.stringify(receipt));
      if (gate.name === 'fixture-first' && config.invalidPin) await fs.writeFile(producerPath, 'changed producer evidence\n');
      if (gate.name === 'fixture-first' && config.preexistingStop) progress.stop = operator;
      return receipt;
    },
    snapshotGate,
    finalizeGateFootprint: async args => {
      state.finalizeCalls.push({ root: args.root, passed: args.passed });
      assert(currentSettlement()?.attempted || args.passed === false, 'marker precedes finalizer');
      const ledger = await finalizeGateFootprint(args);
      state.ledgers.push({ ledger, originalBytes: readFileSync(ledger.ledgerPath) });
      return ledger;
    },
    checkOwnedClosure: attemptOut => {
      const first = attemptOut.includes('/fixture-first/');
      const observation = probe(adapter, first ? config.lsof ?? cleanLsof() : cleanLsof(),
        first ? config.ps ?? cleanPs() : cleanPs(), attemptOut);
      state.closureCalls.push({ attemptOut, observation }); return observation;
    },
    summarizeFootprint: (ledger, pin) => { failOnce('summary'); return adapter.summarizeFootprint(ledger, pin); },
    footprintBlockCause: adapter.footprintBlockCause, recordSettlementReportingFailure: adapter.recordSettlementReportingFailure,
    requireGateAttemptEvidence: step2RequireEvidence, frozenSource, usedNonces: new Set(),
  };
  try {
    assert.deepEqual(Object.keys(context).sort(), [...step2Bindings].sort(), 'all free identifiers explicitly bound');
    await step2Execute(...step2Bindings.map(name => context[name]));
    assert.equal(state.active.size, 0);
    assert.equal(progress.schemaVersion, 1); assert.equal(progress.kind, 'bunki-full-battery-orchestration');
    for (const failure of state.failures) {
      assert.notEqual(failure.error?.name, 'ReferenceError', 'missing harness dependency must never masquerade as safe refusal');
      assert.notEqual(failure.error?.name, 'TypeError', 'harness type mistakes must never masquerade as safe refusal');
    }
    for (const { ledger, originalBytes } of state.ledgers) {
      assert.equal(ledger.version, 1);
      assert.deepEqual(readFileSync(ledger.ledgerPath), originalBytes, 'first completed ledger stays byte-identical');
      assert.equal((await fs.readdir(ledger.root)).filter(name => name.startsWith('.gate-footprint-')).length, 1, 'exactly one settlement journal');
    }
    await inspect(state, operator); succeeded = true;
  } catch (error) {
    await fs.writeFile(join(directory, 'harness-failure.json'), JSON.stringify({ message: error.message, stack: error.stack,
      progress, launches: state.launches, finalizeCalls: state.finalizeCalls }, null, 2)).catch(() => {});
    console.error(`STEP 2 failed fixture retained: ${directory}`); throw error;
  } finally { if (succeeded) await fs.rm(directory, { recursive: true }); }
}
function step2AssertBlock(state, { ledgerReason, stage, errorMessage, nativePassed = true }) {
  const { progress, failures } = state, cause = progress.settlementBlock;
  assert.equal(progress.status, 'blocked'); assert.equal(progress.gates[0].outcome, 'blocked');
  assert.equal(progress.gates[1].outcome, 'pending'); assert(!state.launches.includes('fixture-next'));
  assert.equal(failures.length, 1); assert.equal(failures[0], cause);
  assert.equal(cause.kind, 'footprint-settlement-blocked'); assert.equal(cause.gate, 'fixture-first');
  assert.equal(cause.phase, 'A'); assert.equal(cause.number, 1); assert.equal(cause.stage, stage);
  assert.equal(cause.retentionMode, 'keep-all'); assert.equal(cause.ledgerReason, ledgerReason);
  assert.equal(cause.nativePassed, nativePassed); assert.equal(cause.error.message, errorMessage);
  const detail = Object.entries(cause.closure.commands || {}).map(([name, value]) => `${name} ${value.primary} (exit ${value.status})`).join('; ');
  assert.equal(cause.message, `fixture-first attempt 1: ${ledgerReason}${detail ? '; ' + detail : ''}; ${errorMessage}; evidence preserved`);
  assert.equal(cause.reportingFailureCount, 0); assert.deepEqual(cause.reportingFailures, []);
  assert.equal(progress.gates[0].schedulerError, cause);
  const event = state.events.find(item => item.kind === 'gate-boundary-blocked');
  assert(event, 'structured boundary event retained'); assert.equal(event.message, cause.message);
  assert.deepEqual(event.cause, cause, 'boundary envelope retains the structured settlement cause');
  return cause;
}

test('STEP2 real validated pass settles once and actual scheduler dispatches the next gate exactly once', async () => {
  await step2Fixture({}, state => {
    assert.deepEqual(state.launches, ['fixture-first', 'fixture-next']);
    assert.equal(state.progress.status, 'completed'); assert.equal(state.progress.settlementBlock, null);
    assert.equal(state.progress.stop, null); assert.equal(state.finalizeCalls.length, 2); assert.equal(state.closureCalls.length, 2);
    for (const gate of state.progress.gates) {
      assert.equal(gate.outcome, 'passed'); assert.equal(gate.attempts.length, 1);
      const attempt = gate.attempts[0]; assert.equal(attempt.passed, true); assert.equal(attempt.settlement.stage, 'settled');
      assert.equal(attempt.disk.reason, 'keep-all-policy'); assert.equal(attempt.disk.status, 'retained');
      assert.equal(attempt.disk.closureCheckWallSeconds, 0.1);
      assert.equal(attempt.disk.settlementWallSeconds, 0.4);
      // Preserve the existing summary-inclusive total; the marker also records the shorter finalizer span.
      assert.equal(attempt.settlement.wallSeconds, 0.3);
      assert(attempt.disk.settlementWallSeconds > attempt.settlement.wallSeconds);
      assert.equal(attempt.wallSeconds, 0.1); assert.equal(attempt.nativeGateWallSeconds, 0.1);
      assert.equal(attempt.disk.closure.commands.lsof.elapsedMs, 7); assert.equal(attempt.disk.closure.commands.ps.elapsedMs, 11);
    }
  });
});

for (const command of ['lsof', 'ps']) for (const [label, change, primary] of [
  ['warning', { stderr: 'fixture warning' }, 'warning'],
  ['error', { error: err('ENOENT') }, 'execution-failure'],
  ['timeout', { status: null, error: err('ETIMEDOUT'), signal: 'SIGTERM' }, 'timeout'],
  ['signal', { status: null, signal: 'SIGTERM' }, 'signal'],
]) test(`STEP2 ${command} ${label} pairs with pass and blocks actual next dispatch with its exact cause`, async () => {
  await step2Fixture({ [command]: { ...(command === 'lsof' ? cleanLsof() : cleanPs()), ...change } }, state => {
    const cause = step2AssertBlock(state, { ledgerReason: 'gate-not-closed', stage: 'summary', errorMessage: 'Footprint retention refused settlement' });
    assert.equal(cause.closure.commands[command].primary, primary);
    assert.deepEqual(cause.closure.reasons, [command === 'lsof' ? 'lsof-unverified' : 'process-list-unverified']);
    assert.equal(state.finalizeCalls.length, 1); assert.equal(state.closureCalls.length, 1);
    const attempt = state.progress.gates[0].attempts[0];
    assert.equal(attempt.passed, true, 'native pass remains true when settlement refuses closure');
    assert.equal(attempt.status, 'passed'); assert.equal(attempt.disk.status, 'blocked');
    assert.equal(attempt.disk.settlementWallSeconds, 0.4); assert.equal(attempt.disk.closureCheckWallSeconds, 0.1);
    assert.equal(cause.ledger.sha256, step2Hash(state.ledgers[0].originalBytes));
    assert.equal(state.ledgers[0].ledger.confirmedRemovedBytes, 0); assert.deepEqual(state.ledgers[0].ledger.removedFiles, []);
    assert.equal(state.progress.stop, null, 'closure failure does not impersonate an operator stop');
  });
});

for (const fault of ['summary', 'serialization', 'write', 'marker']) test(`STEP2 ${fault} throw cannot enter a second settlement or dispatch again`, async () => {
  await step2Fixture({ fault }, state => {
    step2AssertBlock(state, { ledgerReason: fault === 'marker' ? 'settlement-threw' : 'keep-all-policy',
      stage: fault === 'marker' ? 'before-finalize' : 'summary', errorMessage: `injected ${fault}` });
    assert.equal(state.finalizeCalls.length, fault === 'marker' ? 0 : 1);
    assert.equal(state.ledgers.length, fault === 'marker' ? 0 : 1);
    assert.equal(state.progress.gates[0].attempts[0].settlement.attempted, true);
    assert(state.markerWrites >= 1); assert.equal(state.faultHits, 1);
    assert.equal(state.progress.gates[0].attempts[0].passed, true);
  });
});

for (const mode of ['invalidProof', 'invalidPin']) test(`STEP2 ${mode} fails real admission before closure and retains exactly once`, async () => {
  await step2Fixture({ [mode]: true }, state => {
    const result = JSON.parse(readFileSync(join(state.directory, 'A/fixture-first/attempt-1/battery.json'), 'utf8')).gates[0];
    let errorMessage;
    try {
      if (mode === 'invalidProof') assert.equal(result.evidenceReceiptSha256, step2Hash(JSON.stringify(result.evidenceReceipt)), 'Evidence transport digest differs');
      else assert.equal(step2Hash(readFileSync(result.proof.receipts[0].path)), result.proof.receipts[0].sha256,
        `Retained evidence changed: ${result.proof.receipts[0].path}`);
    } catch (error) { errorMessage = error.message; }
    assert(errorMessage, 'independent fixture assertion defines the expected native validation failure');
    const cause = step2AssertBlock(state, { ledgerReason: 'failed-attempt-retained', stage: 'native-validation', errorMessage, nativePassed: null });
    if (mode === 'invalidProof') assert.match(cause.error.message, /^Evidence transport digest differs/);
    assert.equal(cause.error.name, 'AssertionError'); assert.equal(state.finalizeCalls.length, 1);
    assert.equal(state.finalizeCalls[0].passed, false); assert.equal(state.closureCalls.length, 0);
    assert.equal(state.progress.gates[0].attempts.length, 0); assert.equal(state.progress.gates[0].blockedFootprints.length, 1);
    assert.equal(state.ledgers[0].ledger.status, 'retained'); assert.equal(state.ledgers[0].ledger.confirmedRemovedBytes, 0);
  });
});

for (const timing of ['preexistingStop', 'lateStop']) test(`STEP2 ${timing} remains distinct from settlement refusal while draining`, async () => {
  await step2Fixture({ [timing]: true, lsof: { ...cleanLsof(), stderr: 'fixture warning' } }, (state, operator) => {
    const cause = step2AssertBlock(state, { ledgerReason: 'gate-not-closed', stage: 'summary', errorMessage: 'Footprint retention refused settlement' });
    assert.deepEqual(state.progress.stop, operator); assert.notEqual(state.progress.stop, cause);
    assert.equal(state.progress.stop.kind, 'operator-stop-after-current-gates');
    const expectedDispatch = timing === 'lateStop' ? ['fixture-first', 'fixture-hold'] : ['fixture-first'];
    assert.deepEqual(state.events.filter(item => item.kind === 'gate-start').map(item => item.name), expectedDispatch);
    // Async footprint snapshots can finish in either order across A/C streams.
    // Keep exact dispatch ordering above, and exactly-once native invocation below.
    assert.deepEqual([...state.launches].sort(), [...expectedDispatch].sort());
    if (timing === 'lateStop') {
      const observed = state.events.find(item => item.kind === 'stop-observed-draining');
      assert(observed); assert.deepEqual(observed.active, ['fixture-hold']);
      assert.equal(state.progress.gates[2].outcome, 'passed');
    }
  });
});
