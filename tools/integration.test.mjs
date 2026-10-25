import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import { parseOwnedClosure, requireFootprintApproval, summarizeFootprint, footprintBlockCause, recordSettlementReportingFailure } from './footprint-support.mjs';

const DIR = dirname(fileURLToPath(import.meta.url)), PACKET = dirname(DIR);
const E = resolve(PACKET, '../..');
const ROOT = '/Users/dhyana/worktrees/Bunki-app/r2-integration_20261021'; // Same Git object store; the old M1 worktree was retired.
const require = createRequire('/Users/dhyana/worktrees/Bunki-app/r2-integration_20261021/package.json');
const ts = require('typescript');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const BASE_PACKET = resolve(PACKET, '../footprint-keep-all-02');
const plan = JSON.parse(readFileSync(join(BASE_PACKET, 'NATIVE-PINS.json')));
const wrapper = readFileSync(join(DIR, 'run-full-r1.mjs'), 'utf8');
const frozen = readFileSync(join(E, 'FULLR1/integration-source/native-prep/run-full-r1.mjs'), 'utf8');
const original = path => execFileSync('git', ['-C', ROOT, 'show', `${plan.baseHead}:${path}`], { encoding: 'utf8' });
const candidate = path => readFileSync(join(BASE_PACKET, 'native-source', path), 'utf8');
function tree(text, name = 'source.mjs') {
  const ast = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
  assert.equal(ast.parseDiagnostics.length, 0, 'Source must parse before testing its declarations');
  return ast;
}
function declaration(text, name) {
  const ast = tree(text); let found;
  function walk(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(ast) === name) found = node;
    ts.forEachChild(node, walk);
  }
  walk(ast); assert(found, name); return found.getText(ast);
}

test('native delta is exactly four replacements against frozen Git blobs; candidate files parse', () => {
  assert.equal(plan.changes.length, 4);
  for (const { path, replacements } of plan.changes) {
    let text = original(path);
    assert.equal(sha(text), plan.files[path].baseSha256);
    for (const [from, to] of replacements) {
      assert.equal(text.split(from).length, 2);
      text = text.replace(from, to);
    }
    assert.equal(candidate(path), text);
    assert.equal(sha(text), plan.files[path].candidateSha256);
    tree(text, path);
  }
});

test('shared-site candidates keep per-file verification and never copy the site', () => {
  for (const path of plan.changes.map(row => row.path).filter(path => /teacher-drafts|reading-position/.test(path))) {
    function specimen(text) {
      const ast = tree(text);
      const index = ast.statements.findIndex(node => ts.isVariableStatement(node)
        && node.declarationList.declarations.some(item => item.name.getText(ast) === 'retainedSite'));
      const end = ast.statements.findIndex((node, i) => i > index && ts.isForOfStatement(node));
      assert(index >= 0 && end > index);
      return ast.statements.slice(index, end + 1).map(node => node.getText(ast)).join('\n');
    }
    for (const corrupt of [false, true]) {
      const ctx = { assert, SITE: '/immutable-site', OUT: '/owned-attempt', join, resolve,
        manifest: { files: [{ path: 'index.html', sha256: sha('same') }] }, sha,
        readFileSync: () => corrupt ? 'changed' : 'same', copies: 0,
        cpSync: () => { ctx.copies++; } };
      if (corrupt) assert.throws(() => vm.runInNewContext(specimen(candidate(path)), ctx));
      else vm.runInNewContext(specimen(candidate(path)) + '\nassert.equal(retainedSite, SITE);', ctx);
      assert.equal(ctx.copies, 0);
    }
    const old = { assert, SITE: '/immutable-site', OUT: '/owned-attempt', join, resolve,
      manifest: { files: [{ path: 'index.html', sha256: sha('same') }] }, sha,
      readFileSync: () => 'same', copies: 0 };
    old.cpSync = () => old.copies++;
    vm.runInNewContext(specimen(original(path)), old);
    assert.equal(old.copies, 1, 'Old duplicate-copy control must be detected');
  }
});

test('offline teardown preserves failed profiles while still closing context/server', async () => {
  const path = 'prototypes/corridor/tools/verify-offline.mjs';
  const prefix = text => {
    const start = text.lastIndexOf('} finally {') + '} finally {'.length;
    const end = text.indexOf('  writeFileSync(', start);
    assert(start > 0 && end > start); return text.slice(start, end);
  };
  for (const version of ['candidate', 'old']) {
    const events = [];
    const context = { context: { close: async () => events.push('context-close') },
      server: { close: done => { events.push('server-close'); done(); } },
      check: (...row) => events.push(row), browserErrors: ['intentional negative'],
      rmSync: path => events.push(['delete', path]), join, RUN_DIR: '/owned-attempt' };
    await vm.runInNewContext(`(async () => {${prefix(version === 'candidate' ? candidate(path) : original(path))}})()`, context);
    assert(events.includes('context-close') && events.includes('server-close'));
    assert.equal(events.filter(row => row[0] === 'delete').length, version === 'candidate' ? 0 : 2);
    assert(events.some(row => row[0] === 'no unexpected page errors' && row[1] === false));
  }
});

test('IndexedDB teardown preserves profiles even when its final assertion fails', async () => {
  const path = 'packages/persistence/test/replication/indexeddb-browser.test.ts';
  function callback(text) {
    const ast = tree(text, path); let found;
    function walk(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'afterAll') found = node;
      ts.forEachChild(node, walk);
    }
    walk(ast); assert(found);
    return ts.transpileModule(found.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  }
  for (const [text, expectedDeletes] of [[candidate(path), 0], [original(path), 1]]) {
    let run; const events = [];
    const ctx = { afterAll: fn => { run = fn; }, context: { close: async () => events.push('close') },
      server: null, profile: '/owned-attempt/profile-chromium-fixture', errors: ['negative'],
      rm: async () => events.push('delete'), expect: () => ({ toEqual: () => { throw new Error('expected page error'); } }) };
    vm.runInNewContext(callback(text), ctx);
    await assert.rejects(run(), /expected page error/);
    assert.equal(events.filter(event => event === 'delete').length, expectedDeletes);
    assert(events.includes('close'));
  }
});

test('scheduler, resource floor, stop path and native acceptance remain byte-identical', () => {
  for (const name of ['chooseWork', 'parseVmStat', 'resourcesReady', 'validateNative', 'stopRequested', 'knownVoice', 'machine', 'LIMIT']) {
    assert.equal(declaration(wrapper, name), declaration(frozen, name), name);
  }
  assert(wrapper.indexOf('validateNative(receipt, gate.name)') < wrapper.indexOf('diskLedger = await finalizeGateFootprint'));
  assert(wrapper.includes('schedule.attempts.push(attempt);\n          // Native receipt validation'));
  assert(wrapper.includes('persist();\n          const footprintStarted = performance.now();\n          settlementAttempted = true;'));
  assert(wrapper.indexOf('settlementAttempted = true;') < wrapper.indexOf('diskLedger = await finalizeGateFootprint'));
  assert(wrapper.includes('if (!settlementAttempted)'));
  assert(wrapper.includes('progress.settlementBlock ||= boundaryCause'));
  assert(!wrapper.includes('progress.stop ||= boundaryCause'));
  const native = original('scripts/verify-release-gates.mjs');
  const run = declaration(native, 'runGates');
  assert(run.includes('verifyArtifact') && run.includes('artifactBefore') && run.includes('artifactAfter'));
});

test('closure refuses a detached browser, open owned files, warning, timeout or unavailable probe', () => {
  const root = '/owned/attempt-1';
  const cleanLsof = { status: 1, stdout: '', stderr: '' }, cleanPs = { status: 0, stdout: '1 launchd\n', stderr: '' };
  assert(parseOwnedClosure(root, cleanLsof, cleanPs).closed);
  for (const lsof of [
    { ...cleanLsof, status: 0, stdout: 'p155\nn/owned/attempt-1/profile/lock\n' },
    { ...cleanLsof, stderr: 'cannot stat' }, { ...cleanLsof, status: null, signal: 'SIGTERM' },
    { ...cleanLsof, error: new Error('ENOENT') },
  ]) assert.equal(parseOwnedClosure(root, lsof, cleanPs).closed, false);
  for (const ps of [
    { ...cleanPs, stdout: '144 /Chrome --user-data-dir=/owned/attempt-1/profile\n' },
    { ...cleanPs, status: 1 }, { ...cleanPs, stderr: 'permission' },
  ]) assert.equal(parseOwnedClosure(root, cleanLsof, ps).closed, false);
});

test('W2 approval binds exact tools, native source, final head and artifact', () => {
  const binding = { pins: { tools: { a: 'a'.repeat(64) }, native: { b: 'b'.repeat(64) } }, head: 'c'.repeat(40), artifact: 'd'.repeat(64) };
  const valid = { kind: 'bunki-full-footprint-review', status: 'approved', reviewer: 'W2', reviewedAt: '2026-10-21T00:00:00Z',
    sourceHead: binding.head, artifactSha256: binding.artifact, pins: binding.pins, scope: 'final-pass-traces-and-owned-profiles-only' };
  assert(requireFootprintApproval(valid, binding));
  for (const alter of [v => v.status = 'pending', v => v.sourceHead = 'e'.repeat(40),
    v => v.artifactSha256 = 'e'.repeat(64), v => delete v.pins.native.b,
    v => v.pins.tools.a = 'f'.repeat(64), v => v.scope = 'all-files']) {
    const bad = structuredClone(valid); alter(bad);
    assert.throws(() => requireFootprintApproval(bad, binding));
  }
});

test('actual wrapper settles after saved native proof; red/boundary failure never cleans', async () => {
  for (const retentionMode of ['cleanup', 'keep-all']) for (const mode of ['pass', 'red', 'invalid', 'retention-blocked']) {
    const events = [], active = new Map(), failures = [];
    const schedule = { name: 'probe', phase: 'A', outcome: 'pending', attempts: [] };
    const result = { name: 'probe', status: mode === 'red' ? 'failed' : 'passed', exitCode: mode === 'red' ? 1 : 0,
      processExitCode: mode === 'red' ? 1 : 0, runId: 'native-nonce', startedAt: '2026-10-21T00:00:00Z', completedAt: '2026-10-21T00:00:01Z',
      proof: { receipts: [{ path: '/owned/A/probe/attempt-1/probe/report.json' }] },
      attemptReceipt: '/owned/A/probe/attempt-1/probe.attempt.json', log: '/owned/A/probe/attempt-1/probe.log' };
    const receipt = { startedAt: result.startedAt, completedAt: result.completedAt,
      artifactBefore: { artifactSha256: 'artifact' }, artifactAfter: { artifactSha256: 'artifact' } };
    const ctx = { assert, join, relative, summarizeFootprint, footprintBlockCause, recordSettlementReportingFailure, retentionMode, now: () => result.startedAt, out: '/owned', root: '/source', site: '/site',
      performance: { now: () => 1 }, active, failures, progress: { expectedHead: 'head', expectedArtifact: 'artifact' },
      existsSync: path => !path.endsWith('attempt-1'), mkdirSync: () => events.push('mkdir'),
      snapshotGate: () => { events.push('snapshot'); return {}; },
      descriptors: () => [{ name: 'probe' }], gateForShard: gate => gate, artifactEnv: {},
      normalized: () => 'descriptor', plannedByName: new Map([['probe', 'descriptor']]),
      updateActive: () => {}, event: value => events.push(value.kind),
      runGates: async () => { events.push('native-return'); return receipt; }, machine: () => ({ load: [1] }),
      validateNative: () => { events.push('validate-native'); if (mode === 'invalid') throw new Error('invalid proof'); return { result, passed: mode !== 'red' }; },
      pin: path => ({ path, sha256: 'digest' }), knownVoice: () => false,
      redDetails: () => ({ detail: 'red', rows: [], logLines: [] }), assertFrozen: () => {},
      persist: () => events.push('persist'), checkOwnedClosure: () => ({ closed: true }),
      finalizeGateFootprint: async args => {
        assert.equal(args.retentionMode, retentionMode);
        events.push(args.passed ? 'cleanup-passed' : 'retain-all');
        assert(events.includes('validate-native'));
        if (args.passed) {
          assert.equal(events.at(-2), 'persist');
          assert.equal(schedule.attempts.length, 1);
          assert(args.evidencePaths.includes('battery.json'));
          assert(args.evidencePaths.every(path => !path.startsWith('/')));
        }
        return { status: mode === 'retention-blocked' ? 'blocked' : args.passed ? 'cleaned' : 'retained',
          reason: mode === 'retention-blocked' ? 'gate-not-closed' : args.passed ? 'validated-passing-gate' : 'failed-attempt-retained',
          ledgerPath: '/owned/ledger.json', closure: mode === 'retention-blocked'
            ? { closed: false, reasons: ['lsof-unverified'], commands: { lsof: { primary: 'warning', status: 1, observedCauses: ['warning'], stderr: { text: 'cannot stat' } } } }
            : { closed: args.passed, reasons: [] } };
      } };
    const start = vm.runInNewContext(`const ${declaration(wrapper, 'start')}; start`, ctx);
    start(schedule, false, { load: [1] });
    await active.get('probe').promise;
    assert.equal(active.size, 0);
    assert.equal(events.includes('cleanup-passed'), mode === 'pass' || mode === 'retention-blocked');
    assert.equal(schedule.outcome, mode === 'pass' ? 'passed' : mode === 'red' ? 'retry-pending' : 'blocked');
    if (mode === 'invalid') assert.equal(schedule.blockedFootprints.length, 1);
    if (mode === 'invalid' || mode === 'retention-blocked') {
      const cause = schedule.schedulerError;
      assert.equal(cause.kind, 'footprint-settlement-blocked'); assert.equal(cause.gate, 'probe');
      assert.equal(cause.ledgerReason, mode === 'invalid' ? 'failed-attempt-retained' : 'gate-not-closed');
      assert.match(cause.message, mode === 'invalid' ? /invalid proof/ : /lsof warning \(exit 1\)/);
      assert.equal(cause.nativePassed, mode === 'invalid' ? null : true);
      assert.equal(ctx.progress.settlementBlock, cause); assert.equal(failures[0], cause);
      assert.doesNotMatch(JSON.stringify(cause), /ReferenceError|TypeError|is not defined/);
    }
  }
});
