#!/usr/bin/env node
// FULL-R1: one shared A/B browser worker; C remains independently classified. Native VH owns execution and admission.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync,
  readdirSync, realpathSync, renameSync, statfsSync, statSync, writeFileSync,
  openSync, readSync, closeSync } from 'node:fs';
import { homedir, loadavg } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { soloFindings, validateFullContract } from '../../../FULL/tools/full-support.mjs';
import { snapshotGate, finalizeGateFootprint } from './disk-retention.mjs';
import { currentFootprintPins, requireFootprintApproval, checkOwnedClosure, summarizeFootprint, footprintBlockCause, recordSettlementReportingFailure } from './footprint-support.mjs';

const SELF = fileURLToPath(import.meta.url), PREP = dirname(SELF);
const EVIDENCE = resolve(PREP, '../../..');
const FULL = join(EVIDENCE, 'FULL'), TOOLS = join(FULL, 'tools');
const RUNROOT = join(EVIDENCE, 'FULLR1');
const REQUIRED_NODE = '/opt/homebrew/Cellar/node@22/22.23.3/bin/node';
const PYTHON_BIN = join(homedir(), '.dharma/bunki_review/2026-10-11/r6-gates/python-venv/bin');
const PHASES = ['A', 'B', 'C'];
const LIMIT = { load1: 16, diskBytes: 8 * 1024 ** 3, memoryBytes: 8 * 1024 ** 3, pollMs: 15000 };
const now = () => new Date().toISOString();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const pin = path => ({ path, bytes: statSync(path).size, sha256: sha(readFileSync(path)) });
const writeJson = (path, data) => {
  writeFileSync(path + '.tmp', JSON.stringify(data, null, 2) + '\n');
  renameSync(path + '.tmp', path);
};
const under = (parent, child) => {
  const r = relative(parent, child);
  return r !== '' && r !== '..' && !r.startsWith('..' + sep) && !isAbsolute(r);
};
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i++) {
  if (['--help', '--preflight-only', '--scheduler-self-test'].includes(args[i])) options[args[i].slice(2)] = true;
  else {
    assert(['--worktree', '--site', '--out', '--expected-head', '--expected-artifact', '--engine-contract', '--contract-review', '--retention'].includes(args[i]), `Unknown argument ${args[i]}`);
    assert(args[i + 1] && !args[i + 1].startsWith('--'), `Missing value for ${args[i]}`);
    options[args[i].slice(2)] = args[++i];
  }
}
function requireSelectedFootprintApproval(value, binding, mode) {
  assert.equal(value?.retentionMode ?? 'cleanup', mode, 'Selected retention mode differs from independent W2 approval');
  if (mode === 'cleanup') return requireFootprintApproval(value, binding);
  assert.equal(mode, 'keep-all');
  assert.equal(value?.kind, 'bunki-full-footprint-review');
  assert.equal(value?.status, 'approved', 'Independent W2 footprint approval required');
  assert.equal(value.scope, 'keep-all-no-deletion');
  assert.equal(value.sourceHead, binding.head);
  assert.equal(value.artifactSha256, binding.artifact);
  assert(typeof value.reviewer === 'string' && value.reviewer.trim());
  assert(Number.isFinite(Date.parse(value.reviewedAt)));
  assert.deepEqual(value.pins, binding.pins, 'Footprint tooling/source differs from the reviewed pins');
  return true;
}
const retentionMode = options.retention ?? 'cleanup';
assert(['cleanup', 'keep-all'].includes(retentionMode), `Unknown retention mode ${retentionMode}`);
if (options.help) {
  console.log('node run-full.mjs --worktree PATH --site PATH --out FRESH_PATH --expected-head FULL_SHA --expected-artifact SHA256 --engine-contract CONTRACT --contract-review ACTUAL_REVIEW [--preflight-only] [--retention cleanup|keep-all]');
  process.exit(0);
}
if (options['scheduler-self-test']) { schedulerSelfTest(); process.exit(0); }
for (const key of ['worktree', 'site', 'out', 'expected-head', 'expected-artifact', 'engine-contract', 'contract-review']) assert(options[key], `Required --${key}`);
assert(/^[a-f0-9]{40}$/.test(options['expected-head']), 'Expected HEAD must be the full commit SHA');
assert(/^[a-f0-9]{64}$/.test(options['expected-artifact']), 'Expected artifact must be SHA256');
const root = realpathSync(options.worktree), site = realpathSync(options.site), out = resolve(options.out);
const contractPath = realpathSync(options['engine-contract']);
const reviewPath = realpathSync(options['contract-review']);
assert(under(RUNROOT, out) && dirname(out) === RUNROOT, 'Output must be a fresh direct child of FULLR1');
assert(!under(root, out) && !under(site, out), 'Output cannot be inside source or artifact');
assert(!existsSync(out), 'Fresh output path required; never resume or overwrite evidence');
assert(!under(join(FULL, 'rehearsal'), out), 'FULL output cannot overwrite rehearsal evidence');
mkdirSync(out, { recursive: true });
assert(under(realpathSync(RUNROOT), realpathSync(out)), 'Output parent symlink escaped FULLR1');
const git = (...argv) => execFileSync('git', argv, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let signalStop = null;
for (const name of ['SIGINT', 'SIGTERM']) process.on(name, () => { signalStop = { signal: name, at: now() }; });
const stopRequested = () => signalStop ? { kind: 'operator-stop-after-current-gates', ...signalStop } : null;

const progress = {
  schemaVersion: 1, kind: 'bunki-full-battery-orchestration', fullAcceptance: false,
  purpose: 'Fresh native FULL battery on one frozen final source and artifact',
  startedAt: now(), completedAt: null, status: 'preflight', root, site, out,
  expectedHead: options['expected-head'], expectedArtifact: options['expected-artifact'], limits: LIMIT, phaseOrder: PHASES,
  gates: [], active: [], stop: null, settlementBlock: null, reports: [],
  footprintPolicy: { retentionMode, finalPassOnly: true, failedAttemptsPreserved: true, sharedVerifiedSite: true,
    bytesWrittenBasis: 'new/changed logical bytes present at settlement, not cumulative device IO',
    realMeasurement: 'pending until admitted native run' },
  schedulingPolicy: { browserWorkers: 1, browserPhases: ['A', 'B'], nonBrowserPhase: 'C', priorReceiptCredit: false },
};
const persist = () => writeJson(join(out, 'progress.json'), progress);
const event = data => appendFileSync(join(out, 'scheduler.jsonl'), JSON.stringify({ at: now(), ...data }) + '\n');
const delay = ms => new Promise(accept => setTimeout(accept, ms));
// Lead1121: macOS reclaimable available pages, not free pages alone.
function parseVmStat(text) {
  assert.equal(typeof text, 'string');
  const headers = [...text.matchAll(/^Mach Virtual Memory Statistics: \(page size of (\d+) bytes\)\s*$/gm)];
  assert.equal(headers.length, 1, 'Missing or duplicate vm_stat page-size header');
  const pageSizeBytes = Number(headers[0][1]);
  assert.equal(pageSizeBytes, 16384, 'Lead1121 requires 16384-byte macOS pages');
  const pages = {};
  for (const key of ['free', 'inactive', 'speculative', 'purgeable']) {
    const rows = [...text.matchAll(new RegExp('^Pages ' + key + ':\\s*(\\d+)\\.\\s*$', 'gm'))];
    assert.equal(rows.length, 1, `Missing or duplicate vm_stat ${key} pages`);
    pages[key] = Number(rows[0][1]);
    assert(Number.isSafeInteger(pages[key]) && pages[key] >= 0, `Invalid vm_stat ${key} pages`);
  }
  const availableBytes = Object.values(pages).reduce((sum, count) => sum + count, 0) * pageSizeBytes;
  assert(Number.isSafeInteger(availableBytes) && availableBytes >= 0, 'Invalid available-memory sum');
  return { pageSizeBytes, pages, availableBytes };
}
function resourcesReady(resources, maxLoad, minDisk, minMemory) {
  return Number.isFinite(resources.load?.[0]) && resources.load[0] >= 0 && resources.load[0] <= maxLoad
    && Number.isFinite(resources.freeBytes) && resources.freeBytes >= minDisk
    && Number.isFinite(resources.memory?.availableBytes) && resources.memory.availableBytes >= minMemory;
}
const machine = () => {
  const disk = statfsSync(out);
  const memory = parseVmStat(execFileSync('/usr/bin/vm_stat', [], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 }));
  return { at: now(), load: loadavg(), freeBytes: disk.bavail * disk.bsize, memory };
};
const tail = path => {
  if (!existsSync(path)) return '';
  const size = statSync(path).size, bytes = Buffer.alloc(Math.min(size, 65536)), fd = openSync(path, 'r');
  try { readSync(fd, bytes, 0, bytes.length, size - bytes.length); } finally { closeSync(fd); }
  return bytes.toString('utf8');
};
function redDetails(receipt, gate, attemptOut) {
  const rows = [], visit = (value, at, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 18 || rows.length >= 80) return;
    const failed = value.ok === false || value.pass === false || value.passed === false
      || value.status === 'failed' || value.status === 'fail' || value.verdict === 'red';
    if (failed) rows.push({ at, row: JSON.stringify(value).slice(0, 3000) });
    for (const [key, child] of Object.entries(value)) visit(child, `${at}.${key}`, depth + 1);
  };
  const paths = [...new Set([gate.report?.path, join(attemptOut, gate.name + '.stdout.json')].filter(Boolean))];
  for (const path of paths) if (existsSync(path)) { try { visit(json(path), path); } catch {} }
  const logPath = join(attemptOut, gate.name + '.log');
  const lines = tail(logPath).split('\n').filter(line => /\b(fail|failed|error|red|not ok|timeout|timed.out)\b|✗|❌/i.test(line)).slice(-50);
  const detail = receipt.gates[0]?.detail || '';
  return { detail, rows, logLines: lines, logPath,
    rowUnavailable: rows.length === 0,
  };
}
function knownVoice(receipt, name, attemptOut) {
  if (name !== 'voice-lock' || receipt.status !== 'failed' || receipt.sourceBoundaryError || receipt.artifactBoundaryError) return false;
  if (receipt.gates.length !== 1 || receipt.gates[0].name !== 'voice-lock'
    || receipt.gates[0].status !== 'failed' || receipt.gates[0].exitCode !== 1
    || receipt.gates[0].processExitCode !== 1) return false;
  try {
    const r = json(join(attemptOut, name + '.stdout.json'));
    return !r.fatal && !r.error && (r.errors === undefined || (Array.isArray(r.errors) && r.errors.length === 0))
      && r.verdict === 'red' && r.coverageRequired === true && r.clipsOwed === 15058
      && Array.isArray(r.problems) && r.problems.length === 1
      && r.problems[0] === 'coverage: 15058 clip(s) the plan owes are not on disk';
  } catch { return false; }
}
function phaseReport(phase, partial = false) {
  const rows = progress.gates.filter(gate => gate.phase === phase);
  if (!rows.some(gate => gate.attempts.length)) return;
  const lines = [
    `# FULL — stream ${phase}${partial ? ' (partial)' : ''}`, '',
    'Fresh FULL attempts. Native admission is unchanged; no red is fixed by this scheduler.', '',
    `HEAD: ${progress.expectedHead}`, `Artifact: ${progress.pins.artifactSha256}`, '',
    '| gate | outcome | attempt loads | evidence |', '| --- | --- | --- | --- |',
    ...rows.map(gate => `| ${gate.name} | ${gate.outcome} | ${gate.attempts.map(a => a.resources.load[0].toFixed(2) + (a.origin === 'prior-serial' ? ' (prior)' : '')).join(', ')} | ${gate.attempts.map(a => a.battery.path).join(', ')} |`), '',
  ];
  for (const gate of rows) for (const attempt of gate.attempts.filter(a => !a.passed)) {
    lines.push(`- ${gate.name}, attempt ${attempt.number}: ${attempt.status}; ${attempt.red.detail || 'See native producer rows/log.'}`,
      `  Evidence: ${attempt.battery.path}; ${attempt.red.logPath}`,
      ...attempt.red.rows.map(row => `  Row ${row.at}: ${row.row.replaceAll('\n', ' ')}`),
      ...(attempt.red.rowUnavailable ? [`  No structured failing row available; native log: ${attempt.red.logLines.join(' / ').slice(0, 6000)}`] : []));
  }
  for (const gate of rows.filter(gate => gate.parallelFirstRedThenSoloPass)) {
    lines.push('', `Parallel red → solo pass: ${gate.name}. Review the exact first-attempt rows above, including any frame-timed rows.`,
      `First: ${gate.parallelFirstRedThenSoloPass.firstAttempt}; retry: ${gate.parallelFirstRedThenSoloPass.retryAttempt}`,
      'Observed overlap and outcome change are reported; causality is not established.');
  }
  lines.push('', '| gate / attempt | origin | attempt wall s | native gate wall s | start load | end load | overlapping gates |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.flatMap(gate => gate.attempts.map(attempt => `| ${gate.name} / ${attempt.number} | ${attempt.origin} | ${attempt.wallSeconds?.toFixed(2) ?? 'unknown'} | ${attempt.nativeGateWallSeconds?.toFixed(2) ?? 'unknown'} | ${attempt.resources.load[0].toFixed(2)} | ${attempt.endResources?.load[0]?.toFixed(2) ?? 'unknown'} | ${attempt.overlaps.map(item => item.name).join(', ') || (attempt.origin === 'prior-serial' ? 'prior serial; no end-load measurement' : 'none observed')} |`)));
  const watches = [
    ['sense-truth WebKit 発 / 大学発 index 272', ['sense-truth-webkit']],
    ['reading-truth WebKit 20 s reader-token timeout', ['reading-truth-webkit']],
    ['word-grammar WebKit G6 keyboard', ['word-grammar-webkit']],
    ['WebKit fresh-demo arrival nami / akafuji', ['contrast-sweep-webkit', 'sweep-webkit']],
    ['X-5 Practice it contrast', ['contrast-sweep', 'contrast-sweep-webkit']],
  ];
  lines.push('', 'Watches (any recurrence remains a defect; no dismissal as noise):',
    ...watches.map(([label, names]) => `- ${label}: ${names.map(name => `${name}=${progress.gates.find(gate => gate.name === name)?.outcome || 'not on roster'}`).join(', ')}. Inspect preserved native rows for the specific recurrence.`),
    'These are gate outcomes, not automatic row-level watch verdicts. An unrun gate is pending.', '',
    'Stream B preserves native mixed-engine invocation and internal order; vitest retains its canonical worker behavior.',
    `Progress: ${join(out, 'progress.json')}`, '');
  const text = lines.join('\n'), path = join(out, `report-${phase}${partial ? '-partial' : ''}.md`);
  writeFileSync(path, text);
  progress.reports.push({ phase, partial, path });
  persist();
}

// One synchronous scheduling decision is the shared admission lock. No worker
// independently acquires work; completion handlers only update state.
function chooseWork(gates, active, contract, stopped = false) {
  if (stopped) return { kind: 'stop' };
  const activeRows = [...active.values()];
  if (activeRows.some(row => row.exclusive)) return { kind: 'drain' };
  const retries = gates.filter(gate => gate.outcome === 'retry-pending');
  if (retries.length) return active.size ? { kind: 'drain' }
    : { kind: 'launch', gate: retries[0], exclusive: true, retry: true };
  const passed = name => ['passed', 'passed-on-retry'].includes(gates.find(gate => gate.name === name)?.outcome);
  const eligible = gate => (contract.dependencies[gate.name] || []).every(passed);
  const first = PHASES.map(phase => gates.find(gate => gate.phase === phase && gate.outcome === 'pending' && eligible(gate))).filter(Boolean);
  const exclusive = first.find(gate => contract.globallyExclusive.includes(gate.name));
  if (exclusive) return active.size ? { kind: 'drain' }
    : { kind: 'launch', gate: exclusive, exclusive: true, retry: false };
  const browserActive = activeRows.some(row => row.phase === 'A' || row.phase === 'B');
  const gate = first.find(candidate => !activeRows.some(row => row.phase === candidate.phase)
    && !(browserActive && (candidate.phase === 'A' || candidate.phase === 'B')));
  return gate ? { kind: 'launch', gate, exclusive: false, retry: false }
    : { kind: active.size ? 'wait' : gates.some(gate => gate.outcome === 'pending') ? 'dependency-blocked' : 'done' };
}
function schedulerSelfTest() {
  const contract = { dependencies: {}, globallyExclusive: ['deck-frozen-build'] };
  const gates = [{ name: 'a', phase: 'A', outcome: 'pending' }, { name: 'b', phase: 'B', outcome: 'pending' }, { name: 'c', phase: 'C', outcome: 'pending' }];
  const active = new Map();
  for (const name of ['a', 'c']) {
    const next = chooseWork(gates, active, contract);
    assert.equal(next.gate.name, name);
    next.gate.outcome = 'running'; active.set(name, { phase: next.gate.phase, exclusive: false });
  }
  assert.equal(chooseWork(gates, active, contract).kind, 'wait');
  gates[0].outcome = 'passed'; active.delete('a');
  let next = chooseWork(gates, active, contract);
  assert.equal(next.gate.name, 'b');
  gates[1].outcome = 'running'; active.set('b', { phase: 'B', exclusive: false });
  assert.equal(chooseWork(gates, active, contract).kind, 'wait');
  gates[1].outcome = 'retry-pending'; active.delete('b');
  assert.equal(chooseWork(gates, active, contract).kind, 'drain');
  gates[2].outcome = 'passed'; active.delete('c');
  next = chooseWork(gates, active, contract);
  assert(next.retry && next.exclusive && next.gate.name === 'b');
  assert.equal(chooseWork(gates, active, contract, true).kind, 'stop');
  gates[1].outcome = 'finding-red-twice';
  assert.equal(chooseWork(gates, active, contract).kind, 'done');
  gates.push({ name: 'deck-frozen-build', phase: 'C', outcome: 'pending' });
  active.set('other', { phase: 'A', exclusive: false });
  assert.equal(chooseWork(gates, active, contract).kind, 'drain');
  active.clear(); next = chooseWork(gates, active, contract);
  assert(next.exclusive && next.gate.name === 'deck-frozen-build');
  const dependent = [{ name: 'e2e', phase: 'A', outcome: 'pending' }, { name: 'e2e-build', phase: 'C', outcome: 'pending' }];
  const deps = { dependencies: { e2e: ['e2e-build'] }, globallyExclusive: [] };
  assert.equal(chooseWork(dependent, new Map(), deps).gate.name, 'e2e-build');
  dependent[1].outcome = 'passed';
  assert.equal(chooseWork(dependent, new Map(), deps).gate.name, 'e2e');
  console.log('scheduler-self-test: passed (one A/B worker plus C; pure decisions only; no native gate, import, browser or filesystem write)');
}

try {
  assert.equal(realpathSync(process.execPath), realpathSync(REQUIRED_NODE));
  assert.equal(process.version, 'v22.23.3', 'FULL uses one explicitly pinned Node runtime');
  assert.equal(realpathSync(git('rev-parse', '--show-toplevel').trim()), root);
  assert.equal(git('rev-parse', 'HEAD').trim(), progress.expectedHead);
  assert.equal(git('status', '--porcelain').trim(), '', 'Clean source required');
  const loadModule = path => import(pathToFileURL(join(root, path)).href);
  const { sourceSnapshot, acceptanceEnvironment, NARROWING_ENV, requireGateAttemptEvidence } = await loadModule('scripts/ci/verification-admission.mjs');
  const cleanEnv = acceptanceEnvironment(process.env);
  const removedNames = [...NARROWING_ENV, 'KAIRO_BROWSER', 'PERSONAL_HOST_BROWSER', 'KAIRO_GATE_RUN_ID', 'KAIRO_BATTERY_TIMEOUT_MS', 'KAIRO_IDB_BROWSERS'];
  for (const name of removedNames) delete process.env[name];
  for (const name of Object.keys(cleanEnv)) if (!removedNames.includes(name)) process.env[name] = cleanEnv[name];
  // Native npm/env-node children and every retry use this same Node executable.
  process.env.PATH = dirname(REQUIRED_NODE) + ':' + PYTHON_BIN + ':' + process.env.PATH;
  process.env.VH_TEST_PYTHON = join(PYTHON_BIN, 'python');
  process.env.KAIRO_CORPUS_PYTHON = join(PYTHON_BIN, 'python');
  const importCheck = execFileSync('python3', ['-c', 'import pytest, fugashi, unidic_lite, genanki, yaml, mwparserfromhell; import sys; print(sys.executable)'], { encoding: 'utf8', env: process.env });
  assert.equal(realpathSync(execFileSync('node', ['-p', 'process.execPath'], { encoding: 'utf8', env: process.env }).trim()), realpathSync(REQUIRED_NODE));
  writeFileSync(join(out, 'python-import-check.txt'), importCheck);
  // Environment is immutable after this point. Native runGates calls keep their
  // receipt/boundary/nonce/timers local and already spawn separate producers.
  const frozenEnvironment = { ...process.env };
  const { batteryGates, runGates, verifyArtifact } = await loadModule('scripts/verify-release-gates.mjs');
  const { supplementalGates } = await loadModule('scripts/ci/supplemental.mjs');
  const { gateForShard } = await loadModule('scripts/ci/battery.mjs');
  const frozenSource = sourceSnapshot(root), artifact = verifyArtifact(site, true);
  assert.equal(artifact.gitSha, progress.expectedHead);
  assert.equal(artifact.artifactSha256, progress.expectedArtifact);
  const identityPath = join(site, 'build-identity.json');
  const enginePath = contractPath, contract = json(enginePath), review = json(reviewPath);
  assert(contract.dependencies && Array.isArray(contract.globallyExclusive));
  assert(contract.globallyExclusive.includes('deck-frozen-build'), 'Tracked deck generator must remain exclusive');
  assert.deepEqual(contract.dependencies.e2e, ['e2e-build']);
  const artifactEnv = { KAIRO_SITE_DIR: site, KAIRO_VERIFIED_ARTIFACT_SHA256: artifact.artifactSha256, KAIRO_ARTIFACT_SHA256: artifact.artifactSha256 };
  const descriptors = attemptOut => [...batteryGates(attemptOut, { ...frozenEnvironment, ...artifactEnv }), ...supplementalGates(attemptOut)];
  const planOut = join(out, '__descriptor_paths_only__'), planned = descriptors(planOut);
  const roster = json(join(root, 'scripts/ci/vh-required-gate-roster.json'));
  assert.equal(batteryGates(planOut, { ...frozenEnvironment, ...artifactEnv }).length, roster.canonicalNames.length);
  assert.equal(supplementalGates(planOut).length, roster.supplementalNames.length);
  assert.equal(planned.length, roster.requiredNames.length);
  assert.equal(new Set(planned.map(gate => gate.name)).size, planned.length);
  assert.deepEqual(planned.map(gate => gate.name), [...roster.canonicalNames, ...roster.supplementalNames]);
  assert.deepEqual([...planned.map(gate => gate.name)].sort(), [...roster.requiredNames].sort());
  const contractNames = PHASES.flatMap(phase => contract.streams[phase]);
  assert.equal(contractNames.length, planned.length);
  assert.equal(new Set(contractNames).size, planned.length);
  assert.deepEqual([...contractNames].sort(), [...roster.requiredNames].sort());
  const normalized = (gate, attemptOut) => JSON.stringify(gate).replaceAll(attemptOut, '<ATTEMPT_OUT>');
  const plannedByName = new Map(planned.map(gate => [gate.name, normalized(gateForShard(gate, { id: gate.name, gates: [gate.name] }, artifactEnv), planOut)]));
  validateFullContract(contract, review, { head: progress.expectedHead, tree: git('rev-parse', 'HEAD^{tree}').trim(), artifactSha256: progress.expectedArtifact,
    roster, descriptors: planned.map(gate => gateForShard(gate, { id: gate.name, gates: [gate.name] }, artifactEnv)), out: planOut, contractSha256: pin(enginePath).sha256 });
  const footprintPins = currentFootprintPins(PREP, root);
  requireSelectedFootprintApproval(review.footprint, { pins: footprintPins, head: progress.expectedHead, artifact: progress.expectedArtifact }, retentionMode);
  progress.footprintPins = footprintPins;
  for (const evidence of contract.rehearsalEvidence) {
    assert.equal(pin(evidence.progress.path).sha256, evidence.progress.sha256, 'Reviewed rehearsal evidence changed');
    assert.deepEqual(soloFindings(json(evidence.progress.path)), evidence.soloFindings, 'Rehearsal exclusivity findings were omitted or changed');
    for (const finding of evidence.soloFindings) for (const binding of [finding.first, finding.retry]) assert.equal(pin(binding.path).sha256, binding.sha256);
  }
  for (const phase of PHASES) progress.gates.push(...contract.streams[phase].map(name => ({ name, phase, outcome: 'pending', attempts: [] })));
  const sourcePaths = [...new Set(['scripts/verify-release-gates.mjs', 'scripts/ci/battery.mjs', 'scripts/ci/supplemental.mjs', 'scripts/ci/verification-admission.mjs', 'scripts/ci/vh-required-gate-roster.json', ...Object.keys(contract.sourcePins)])];
  const sourcePins = Object.fromEntries(sourcePaths.map(path => [path, pin(join(root, path)).sha256]));
  for (const [path, digest] of Object.entries(contract.sourcePins)) assert.equal(sourcePins[path], digest, `Stream contract source changed: ${path}`);
  writeFileSync(join(out, 'source-tree.txt'), git('ls-tree', '-r', '--full-tree', 'HEAD'));
  copyFileSync(identityPath, join(out, 'build-identity.json'));
  copyFileSync(enginePath, join(out, 'full-engine-contract.json'));
  copyFileSync(reviewPath, join(out, 'contract-review.json'));
  writeJson(join(out, 'descriptors.json'), planned.map(gate => ({ name: gate.name, descriptor: JSON.parse(plannedByName.get(gate.name)) })));
  progress.pins = {
    head: progress.expectedHead, tree: git('rev-parse', 'HEAD^{tree}').trim(), sourceSnapshot: frozenSource,
    sourceTree: pin(join(out, 'source-tree.txt')), sourcePins, artifactSha256: artifact.artifactSha256,
    artifactFiles: artifact.files, identity: pin(identityPath), retainedIdentity: pin(join(out, 'build-identity.json')),
    orchestrator: pin(SELF), engineContract: pin(enginePath), descriptors: pin(join(out, 'descriptors.json')),
    python: { executable: importCheck.trim(), VH_TEST_PYTHON: process.env.VH_TEST_PYTHON, KAIRO_CORPUS_PYTHON: process.env.KAIRO_CORPUS_PYTHON },
    removedAmbientNames: removedNames, verification: artifact,
    contractReview: pin(reviewPath), support: pin(join(TOOLS, 'full-support.mjs')),
    runtime: { nodeVersion: process.version, executable: pin(process.execPath), pathNode: realpathSync(REQUIRED_NODE) },
    rehearsalSchedulingEvidence: contract.rehearsalEvidence.map(item => item.progress),
  };
  const assertFrozen = () => {
    assert.deepEqual(sourceSnapshot(root), frozenSource, 'Source changed since FULL startup');
    assert.deepEqual(currentFootprintPins(PREP, root), footprintPins, 'Footprint source/tool pins changed');
    assert.deepEqual({ ...process.env }, frozenEnvironment, 'Runtime parent environment changed');
    assert.equal(pin(identityPath).sha256, progress.pins.identity.sha256, 'Build manifest changed');
    assert.equal(pin(SELF).sha256, progress.pins.orchestrator.sha256, 'FULL orchestrator changed');
    assert.equal(pin(enginePath).sha256, progress.pins.engineContract.sha256, 'Stream contract changed');
    assert.equal(pin(reviewPath).sha256, progress.pins.contractReview.sha256, 'Contract review changed');
    assert.equal(pin(join(TOOLS, 'full-support.mjs')).sha256, progress.pins.support.sha256, 'FULL admission support changed');
    for (const binding of progress.pins.rehearsalSchedulingEvidence) assert.equal(pin(binding.path).sha256, binding.sha256, 'Rehearsal scheduling evidence changed');
    for (const [path, digest] of Object.entries(sourcePins)) assert.equal(pin(join(root, path)).sha256, digest, `Source pin changed: ${path}`);
  };
  const verifyPin = binding => {
    assert(binding?.path && /^[a-f0-9]{64}$/.test(binding.sha256), 'Malformed retained file pin');
    const actual = pin(binding.path);
    assert.equal(actual.sha256, binding.sha256, `Retained evidence changed: ${binding.path}`);
    if (binding.bytes !== undefined) assert.equal(actual.bytes, binding.bytes);
  };
  const usedNonces = new Set();
  function validateNative(receipt, name) {
    assert.equal(receipt.kind, 'kairo-required-battery'); assert.equal(receipt.schemaVersion, 1);
    assert.equal(receipt.source.sha, progress.expectedHead); assert.equal(receipt.source.dirty, false);
    assert.equal(receipt.source.site, site); assert.equal(receipt.source.artifactSha256, progress.expectedArtifact);
    assert.deepEqual(receipt.sourceBefore, frozenSource); assert.deepEqual(receipt.sourceAfter, frozenSource);
    assert(!receipt.sourceBoundaryError && !receipt.artifactBoundaryError, 'Native boundary failed');
    for (const key of ['artifactBefore', 'artifactAfter']) {
      assert.equal(receipt[key]?.artifactSha256, progress.expectedArtifact);
      assert.equal(receipt[key]?.gitSha, progress.expectedHead);
    }
    assert.equal(receipt.gates.length, 1);
    const result = receipt.gates[0]; assert.equal(result.name, name);
    assert(typeof result.runId === 'string' && result.runId.length > 0 && !usedNonces.has(result.runId), 'Missing/reused attempt nonce');
    usedNonces.add(result.runId);
    const passed = receipt.status === 'passed' && receipt.exitCode === 0 && result.status === 'passed' && result.exitCode === 0;
    if (passed) {
      requireGateAttemptEvidence(result, { gitSha: progress.expectedHead, artifactSha256: progress.expectedArtifact });
      for (const binding of result.proof.receipts || []) verifyPin(binding);
      for (const binding of result.proof.obligation?.inputs || []) {
        if (typeof binding === 'object' && binding.sha256) verifyPin({ ...binding, path: isAbsolute(binding.path) ? binding.path : join(root, binding.path) });
      }
    } else assert.equal(receipt.status, 'failed', 'Incomplete/interrupted attempt cannot silently become a scheduled red');
    return { result, passed };
  }
  assertFrozen();
  progress.status = options['preflight-only'] ? 'preflight-passed-no-gates-run' : 'ready'; persist();
  event({ kind: 'full-preflight-passed', canonical: roster.canonicalNames.length, supplemental: roster.supplementalNames.length,
    streams: Object.fromEntries(PHASES.map(phase => [phase, contract.streams[phase].length])) });
  if (!options['preflight-only']) {
    const active = new Map(), failures = [];
    const updateActive = () => { progress.active = [...active.values()].map(({ promise, ...rest }) => rest); persist(); };
    const start = (schedule, exclusive, resources) => {
      const number = schedule.attempts.length + 1; assert(number <= 2);
      const attemptOut = join(out, schedule.phase, schedule.name, `attempt-${number}`);
      assert(!existsSync(attemptOut)); mkdirSync(attemptOut, { recursive: true });
      let footprintBefore, diskLedger, attempt, boundaryCause;
      let settlementAttempted = false;
      let gate = descriptors(attemptOut).find(item => item.name === schedule.name);
      gate = gateForShard(gate, { id: gate.name, gates: [gate.name] }, artifactEnv);
      assert.equal(normalized(gate, attemptOut), plannedByName.get(gate.name), 'Native descriptor changed');
      const overlap = [...active.values()].map(row => ({ name: row.name, phase: row.phase, number: row.number, startedAt: row.startedAt }));
      const run = { name: gate.name, phase: schedule.phase, number, exclusive, attemptOut, resources, startedAt: now(), overlaps: overlap };
      for (const row of active.values()) row.overlaps.push({ name: run.name, phase: run.phase, number, startedAt: run.startedAt });
      schedule.outcome = 'running'; active.set(gate.name, run); progress.status = 'running'; updateActive();
      event({ kind: 'gate-start', ...run });
      const block = (error, stage) => {
        if (boundaryCause) { recordSettlementReportingFailure(boundaryCause, stage, error); return boundaryCause; }
        boundaryCause = footprintBlockCause({ gate: gate.name, phase: schedule.phase, number, attemptOut,
          retentionMode, nativePassed: attempt?.passed, stage, ledger: diskLedger, ledgerPin: run.settlement?.ledger, error });
        schedule.outcome = 'blocked'; schedule.schedulerError = boundaryCause;
        failures.push(boundaryCause); progress.settlementBlock ||= boundaryCause;
        if (attempt) attempt.settlementBlock = boundaryCause;
        return boundaryCause;
      };
      const started = performance.now();
      run.promise = (async () => {
        try {
          footprintBefore = await snapshotGate(attemptOut);
          const receipt = await runGates({ gates: [gate], root, out: attemptOut,
            source: { sha: progress.expectedHead, dirty: false, site, artifactSha256: progress.expectedArtifact } });
          const endResources = machine(), wallSeconds = (performance.now() - started) / 1000;
          const { result, passed } = validateNative(receipt, gate.name);
          const nativeGateWallSeconds = (Date.parse(result.completedAt) - Date.parse(result.startedAt)) / 1000;
          const nativeBatteryWallSeconds = (Date.parse(receipt.completedAt) - Date.parse(receipt.startedAt)) / 1000;
          attempt = { number, origin: 'full', observedHere: true, passed, status: result.status,
            exitCode: result.exitCode, processExitCode: result.processExitCode, runId: result.runId,
            startedAt: receipt.startedAt, completedAt: receipt.completedAt, resources, endResources, wallSeconds,
            nativeGateWallSeconds, nativeBatteryWallSeconds, admissionAndWrapperOverheadSeconds: wallSeconds - nativeGateWallSeconds,
            wallTimeBasis: 'Monotonic elapsed time around native runGates, including its boundary checks',
            exclusive, overlaps: run.overlaps, overlapBasis: 'Observed overlapping native runGates lifetimes; not inferred CPU/frame causality',
            battery: pin(join(attemptOut, 'battery.json')),
            retained: [result.attemptReceipt, result.log, join(attemptOut, gate.name + '.stdout.json')].filter(path => path && existsSync(path)).map(pin),
            sourceBefore: receipt.sourceBefore, sourceAfter: receipt.sourceAfter,
            artifactBefore: receipt.artifactBefore?.artifactSha256, artifactAfter: receipt.artifactAfter?.artifactSha256,
            knownVoiceRed: knownVoice(receipt, gate.name, attemptOut), ...(!passed ? { red: redDetails(receipt, gate, attemptOut) } : {}),
          };
          assertFrozen();
          schedule.attempts.push(attempt);
          // Native receipt validation and all mandatory evidence hashes precede retention.
          // Save the pass record before any owned scratch can be removed.
          persist();
          const footprintStarted = performance.now();
          settlementAttempted = true;
          run.settlement = attempt.settlement = { attempted: true, startedAt: now(), stage: 'before-finalize', closureCheckWallSeconds: null };
          persist(); // Marker precedes await, ledger pinning and summary work, including their throw paths.
          try {
            run.settlement.stage = 'finalize';
            diskLedger = await finalizeGateFootprint({ root: attemptOut, before: footprintBefore, passed, retentionMode,
              evidencePaths: [attempt.battery.path, ...attempt.retained.map(item => item.path),
                ...(result.proof?.receipts || []).map(item => item.path)].map(path => relative(attemptOut, path)),
              closureCheck: () => {
                const closureStarted = performance.now();
                try { assertFrozen(); const closure = checkOwnedClosure(attemptOut); assertFrozen(); return closure; }
                finally { run.settlement.closureCheckWallSeconds = (performance.now() - closureStarted) / 1000; }
              } });
          } finally { run.settlement.wallSeconds = (performance.now() - footprintStarted) / 1000; }
          run.settlement.stage = 'ledger-pin';
          run.settlement.ledger = pin(diskLedger.ledgerPath);
          run.settlement.stage = 'summary';
          attempt.disk = summarizeFootprint(diskLedger, pin);
          attempt.disk.settlementWallSeconds = (performance.now() - footprintStarted) / 1000;
          attempt.disk.closureCheckWallSeconds = run.settlement.closureCheckWallSeconds;
          attempt.disk.sharedSite = { path: site, artifactSha256: progress.expectedArtifact,
            before: receipt.artifactBefore?.artifactSha256, after: receipt.artifactAfter?.artifactSha256,
            verification: 'native runGates verifies the complete artifact before and after this gate', copies: 0 };
          persist();
          if (attempt.disk.status === 'blocked') throw Object.assign(new Error('Footprint retention refused settlement'), { code: 'FOOTPRINT_SETTLEMENT_BLOCKED' });
          run.settlement.stage = 'settled';
          schedule.outcome = passed ? (number === 1 ? 'passed' : 'passed-on-retry') : attempt.knownVoiceRed ? 'known-voice-red-no-retry' : number === 1 ? 'retry-pending' : 'finding-red-twice';
          if (number === 2 && passed && schedule.attempts[0].origin === 'full' && schedule.attempts[0].overlaps.length) {
            schedule.parallelFirstRedThenSoloPass = { observationOnly: true, firstAttempt: schedule.attempts[0].battery.path,
              retryAttempt: attempt.battery.path, rows: schedule.attempts[0].red.rows,
              note: 'Failed while another gate overlapped; passed alone. Preserve these exact rows for lead review; causality is not established.' };
          }
          event({ kind: 'gate-finished', name: gate.name, phase: schedule.phase, number, outcome: schedule.outcome, wallSeconds, nativeGateWallSeconds, nativeBatteryWallSeconds, startLoad: resources.load, endLoad: endResources.load, overlaps: run.overlaps });
          assertFrozen();
        } catch (error) {
          const cause = block(error, run.settlement?.stage || 'native-validation');
          // Failed native validation may retain once; an entered settlement may NEVER run twice.
          if (!settlementAttempted) {
            settlementAttempted = true;
            run.settlement = { attempted: true, startedAt: now(), stage: 'failed-native-retention' };
            try {
              persist();
              diskLedger = await finalizeGateFootprint({ root: attemptOut, before: footprintBefore, passed: false, retentionMode,
                evidencePaths: [], closureCheck: () => ({ closed: false }) });
              run.settlement.ledger = pin(diskLedger.ledgerPath);
              // Carry the raw ledger identity/cause even if the following summary throws.
              Object.assign(cause, footprintBlockCause({ gate: gate.name, phase: schedule.phase, number, attemptOut,
                retentionMode, nativePassed: null, stage: 'native-validation', ledger: diskLedger, ledgerPin: run.settlement.ledger, error }));
              run.disk = summarizeFootprint(diskLedger, pin);
              schedule.blockedFootprints ||= [];
              schedule.blockedFootprints.push({ number, ...run.disk });
            } catch (diskError) { recordSettlementReportingFailure(cause, 'failed-native-retention', diskError); }
          }
          try { persist(); } catch (reportError) { recordSettlementReportingFailure(cause, 'progress-write', reportError); }
          try { event({ ...cause, kind: 'gate-boundary-blocked', cause }); }
          catch (reportError) { recordSettlementReportingFailure(cause, 'scheduler-event-write', reportError); }
        } finally {
          active.delete(gate.name);
          try { updateActive(); } catch (reportError) {
            const cause = block(reportError, 'active-progress-write');
            try { event({ ...cause, kind: 'gate-boundary-reporting-failed', cause }); }
            catch (eventError) { recordSettlementReportingFailure(cause, 'scheduler-event-write', eventError); }
          }
        }
      })();
    };
    try { while (true) {
      const stop = stopRequested();
      if (stop && !progress.stop) {
        progress.stop = stop; progress.status = 'draining-after-stop'; persist();
        event({ kind: 'stop-observed-draining', stop, active: [...active.keys()] });
      }
      const choice = chooseWork(progress.gates, active, contract, Boolean(progress.stop || failures.length));
      if (choice.kind === 'stop') {
        if (!active.size) break;
      } else if (choice.kind === 'done' || choice.kind === 'dependency-blocked') {
        if (choice.kind === 'dependency-blocked') {
          progress.blockedDependencies = progress.gates.filter(gate => gate.outcome === 'pending').map(gate => ({ name: gate.name, dependencies: contract.dependencies[gate.name] || [] }));
          for (const blocked of progress.blockedDependencies) {
            const gate = progress.gates.find(item => item.name === blocked.name);
            gate.outcome = 'blocked-unrun'; gate.blockedBy = blocked.dependencies;
          }
        }
        break;
      } else if (choice.kind === 'launch') {
        assertFrozen();
        const observation = machine(); event({ kind: 'prelaunch-resource-check', candidate: choice.gate.name, ...observation });
        if (resourcesReady(observation, LIMIT.load1, LIMIT.diskBytes, LIMIT.memoryBytes)) {
          const stopBeforeLaunch = stopRequested();
          if (stopBeforeLaunch) { progress.stop = stopBeforeLaunch; progress.status = 'draining-after-stop'; persist(); event({ kind: 'stop-observed-draining', stop: stopBeforeLaunch, active: [...active.keys()] }); continue; }
          assert(!choice.exclusive || active.size === 0, 'Exclusive attempt cannot overlap another native gate');
          assert(![...active.values()].some(row => row.phase === choice.gate.phase), 'Two active gates in one stream');
          assert(choice.gate.phase === 'C' || ![...active.values()].some(row => row.phase === 'A' || row.phase === 'B'), 'Two active browser workers');
          start(choice.gate, choice.exclusive, observation); continue;
        }
        progress.status = 'waiting-for-resources'; progress.resources = observation; persist();
      }
      // Active calls finish naturally. Stop checks remain responsive during a wait.
      await Promise.race([delay(LIMIT.pollMs), ...[...active.values()].map(row => row.promise)]);
    } } catch (error) {
      failures.push({ scope: 'scheduler', message: error.message });
      progress.status = 'draining-after-scheduler-error'; updateActive();
      event({ kind: 'scheduler-error-draining', message: error.message });
      await Promise.allSettled([...active.values()].map(row => row.promise));
    }
    assert.equal(active.size, 0, 'Scheduler exited with an active native gate');
    progress.status = failures.length ? 'blocked' : progress.stop ? 'stopped-before-next-gate' : progress.blockedDependencies ? 'blocked-dependencies' : 'completed';
    progress.schedulerFailures = failures;
    for (const phase of PHASES) phaseReport(phase, progress.gates.some(gate => gate.phase === phase && ['pending', 'retry-pending', 'blocked', 'blocked-unrun'].includes(gate.outcome)));
  }
  progress.completedAt = now();
  progress.allFinalGateOutcomesPassed = !options['preflight-only'] && progress.status === 'completed'
    && progress.gates.every(gate => ['passed', 'passed-on-retry'].includes(gate.outcome));
  progress.fullAcceptance = progress.allFinalGateOutcomesPassed;
  progress.counts = Object.fromEntries(PHASES.map(phase => [phase, {
    planned: progress.gates.filter(gate => gate.phase === phase).length,
    passed: progress.gates.filter(gate => gate.phase === phase && ['passed', 'passed-on-retry'].includes(gate.outcome)).length,
    knownVoiceRed: progress.gates.filter(gate => gate.phase === phase && gate.outcome === 'known-voice-red-no-retry').length,
    repeatedRed: progress.gates.filter(gate => gate.phase === phase && gate.outcome === 'finding-red-twice').length,
    pending: progress.gates.filter(gate => gate.phase === phase && ['pending', 'retry-pending', 'blocked', 'blocked-unrun'].includes(gate.outcome)).length,
  }]));
  persist(); console.log(JSON.stringify({ status: progress.status, counts: progress.counts, progress: join(out, 'progress.json'), fullAcceptance: progress.fullAcceptance }));
  process.exitCode = options['preflight-only'] ? 0 : progress.status === 'blocked' || progress.status === 'blocked-dependencies' ? 1 : progress.stop ? 75 : progress.gates.some(gate => gate.attempts.some(attempt => !attempt.passed)) ? 1 : 0;
} catch (error) {
  progress.status = 'blocked'; progress.error = { message: error.message, stack: error.stack }; progress.completedAt = now();
  persist(); event({ kind: 'orchestrator-blocked', message: error.message });
  console.error(error.stack); process.exitCode = 1;
}

