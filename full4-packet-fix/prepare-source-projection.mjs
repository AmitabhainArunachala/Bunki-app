// Source-only FULL4 projection. No producer import, artifact read, compilation,
// app mutation, native dispatch, or execution admission is performed here.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { descriptorDigest } from '../../FULL/tools/full-support.mjs';
import { currentFootprintPins, TOOL_FILES } from '../settlement-diagnostics-01/tools/footprint-support.mjs';

const SELF = fileURLToPath(import.meta.url), P = dirname(SELF), FULLR1 = dirname(P);
const ROOT = '/Users/dhyana/worktrees/Bunki-app/full4-packet_20261025';
const TOOLS = join(FULLR1, 'settlement-diagnostics-01/tools');
const NODE = '/opt/homebrew/Cellar/node@22/22.23.3/bin/node';
export const EXPECTED_HEAD = '36a31d20a22e39ee4d9dd827ca11f8a67093c730';
const DD0_HEAD = 'dd0d2403a2c79c586e36b9a0ec98c8d38f181394';
export const EXPECTED_TREE = '55420851b49cd5ca6285005dfbb375d53fadb633';
const DD0_TREE = '96730291ab684c3eaa482bd262fb789e713f25d6';
const OLD = join(FULLR1, 'footprint-successor-01/native-prep/source-descriptor-projection.json');
const REVIEW = '/Users/dhyana/.dharma/bunki/LEAD/reviews/1225-full4-launch-checklist/CHECKS.json';
const DD0_PROJECTION = join(FULLR1, 'FULL4-dd0d2403-20261025-01/source-descriptor-projection.json');
const I1_RECEIPT = join(FULLR1, 'FULL4-I1-20261025-01/RECEIPT.json');
const I1_AUTHORITY = join(FULLR1, '../MISSION/inbox/1239-lead-w3-packet-binding-I1-A1.md');
const I1_DONORS = join(FULLR1, 'footprint-keep-all-02/native-source');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const pin = path => ({ path, bytes: statSync(path).size, sha256: sha(readFileSync(path)) });
const git = (...args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 128 * 1024 ** 2 });
const gitText = (...args) => git(...args).toString('utf8').trim();

export function sourceIdentity(expectedHead = EXPECTED_HEAD, expectedTree = EXPECTED_TREE) {
  assert.equal(realpathSync(gitText('rev-parse', '--show-toplevel')), realpathSync(ROOT), 'FULL4 checkout root differs');
  const head = gitText('rev-parse', 'HEAD'), tree = gitText('rev-parse', 'HEAD^{tree}');
  assert.equal(head, expectedHead, 'FULL4 source HEAD differs');
  assert.equal(tree, expectedTree, 'FULL4 source tree differs');
  assert.equal(gitText('status', '--porcelain'), '', 'FULL4 source is dirty');
  return { worktree: ROOT, head, tree, clean: true };
}

export function prepareSourceProjection({ expectedHead = EXPECTED_HEAD, expectedTree = EXPECTED_TREE } = {}) {
  assert.equal(realpathSync(process.execPath), realpathSync(NODE), 'pinned Node required');
  const before = sourceIdentity(expectedHead, expectedTree);
  // A caller cannot relabel a different accepted object as this FULL4 packet.
  assert.equal(before.head, EXPECTED_HEAD); assert.equal(before.tree, EXPECTED_TREE);
  const old = json(OLD), reviewed = json(REVIEW), previousDd0 = json(DD0_PROJECTION), i1 = json(I1_RECEIPT);
  assert.equal(reviewed.head, DD0_HEAD); assert.equal(reviewed.tree, DD0_TREE);
  assert.equal(previousDd0.sourceHead, DD0_HEAD); assert.equal(previousDd0.sourceTree, DD0_TREE);
  assert.equal(gitText('rev-parse', `${EXPECTED_HEAD}^`), DD0_HEAD, 'I1 must directly descend from reviewed dd0');
  assert.equal(i1.head, EXPECTED_HEAD); assert.equal(i1.tree, EXPECTED_TREE);
  const i1Policy = json(join(TOOLS, 'native-policy.json'));
  const i1Paths = Object.keys(i1Policy.nativeSourcePins).sort();
  assert.equal(i1Paths.length, 4);
  assert.deepEqual(git('diff', '--name-only', '-z', DD0_HEAD, EXPECTED_HEAD).toString('utf8').split('\0').filter(Boolean).sort(), i1Paths,
    'Only the four authorized I1 files may differ from dd0');
  const tree = new Map(git('ls-tree', '-r', '-z', expectedHead).toString('utf8').split('\0').filter(Boolean).map(row => {
    const tab = row.indexOf('\t'), [mode, type, oid] = row.slice(0, tab).split(' ');
    return [row.slice(tab + 1), { mode, type, oid }];
  }));
  const paths = new Set([...tree].filter(([, row]) => row.type === 'blob').map(([path]) => path));
  const cache = new Map();
  const blob = path => {
    assert(paths.has(path), `Descriptor input is not committed: ${path}`);
    if (!cache.has(path)) cache.set(path, git('show', `${expectedHead}:${path}`));
    return cache.get(path);
  };
  const relativeSource = value => {
    if (value instanceof URL) value = fileURLToPath(value);
    const path = relative(ROOT, resolve(String(value)));
    assert(path && path !== '..' && !path.startsWith('../') && !isAbsolute(path), 'Descriptor read escaped committed source');
    return path;
  };
  const readGit = (path, encoding) => {
    const bytes = blob(relativeSource(path));
    return encoding ? bytes.toString(typeof encoding === 'string' ? encoding : encoding.encoding) : bytes;
  };
  const existsGit = path => {
    const rel = relative(ROOT, resolve(String(path)));
    return rel && rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel) ? paths.has(rel) : false;
  };
  const require = createRequire(join(ROOT, 'package.json')), ts = require('typescript');
  const liftedDeclarations = [];
  function lift(path, name) {
    const source = blob(path).toString('utf8');
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    assert.equal(ast.parseDiagnostics.length, 0, path);
    const matches = ast.statements.filter(node =>
      ts.isFunctionDeclaration(node) && node.name?.text === name
      || ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(ast) === name));
    assert.equal(matches.length, 1, `Unique actual source declaration: ${name}`);
    const text = matches[0].getText(ast).replace(/^export\s+/, '');
    liftedDeclarations.push({ file: path, name, sha256: sha(text) });
    return text;
  }
  const declarations = [
    ['scripts/ci/vh-batch3-report-contracts.mjs', 'BATCH3_SUITES'],
    ['scripts/ci/vh-batch3-report-contracts.mjs', 'BATCH3_REPORT_TYPES'],
    ['scripts/verify-release-gates.mjs', 'timeoutMs'],
    ['scripts/verify-release-gates.mjs', 'batteryGates'],
    ['scripts/ci/supplemental.mjs', 'supplementalGates'],
    ['scripts/ci/battery.mjs', 'gateForShard'],
  ].map(([path, name]) => lift(path, name)).join('\n');
  const context = vm.createContext({ assert, createHash, join, resolve, homedir, ROOT,
    DEFAULT_TIMEOUT_MS: 20 * 60 * 1000, existsSync: existsGit, readFileSync: readGit,
    json: () => { throw new Error('Source projection cannot read an artifact identity'); },
    practiceGateSourceMetadata: () => { throw new Error('Source projection cannot construct artifact metadata'); },
    process: Object.freeze({ execPath: NODE, env: Object.freeze({}) }),
    descriptorOut: join(P, '__descriptor_paths_only__'),
    python: join(homedir(), '.dharma/bunki_review/2026-10-11/r6-gates/python-venv/bin/python') });
  vm.runInContext(declarations, context, { timeout: 1000 });
  const gates = JSON.parse(vm.runInContext(`JSON.stringify([
    ...batteryGates(descriptorOut, { KAIRO_CORPUS_PYTHON: python }), ...supplementalGates(descriptorOut)
  ].map(g => gateForShard(g, { id: g.name, gates: [g.name] }, {})))`, context, { timeout: 10000 }));
  const roster = JSON.parse(blob('scripts/ci/vh-required-gate-roster.json'));
  assert.equal(gates.length, 216); assert.equal(new Set(gates.map(g => g.name)).size, 216);
  assert.deepEqual(gates.map(g => g.name), [...roster.canonicalNames, ...roster.supplementalNames]);
  assert.deepEqual(gates.map(g => g.name).sort(), [...roster.requiredNames].sort());
  const descriptors = gates.map(g => JSON.parse(JSON.stringify(g).replaceAll(context.descriptorOut, '<ATTEMPT_OUT>')));
  const sourceOnlyDescriptorSha256 = Object.fromEntries(gates.map(g => [g.name, descriptorDigest(g, context.descriptorOut)]));
  const oldByName = new Map(old.perGate.map(row => [row.name, row]));
  const perGate = gates.map(gate => {
    const prior = oldByName.get(gate.name);
    assert(prior, `New gate requires an explicit provisional classification: ${gate.name}`);
    const direct = [gate.requiredPath, ...gate.args].filter(path => typeof path === 'string' && paths.has(path));
    // Lead1252: the journey producer invokes this actual child builder.
    const childInputs = gate.name === 'standalone-journey' ? ['prototypes/corridor/tools/build-standalone.mjs'] : [];
    for (const path of childInputs) assert(paths.has(path), `Committed child input required: ${path}`);
    return { ...prior, files: [...new Set([...prior.files, ...direct, ...childInputs])],
      classificationStatus: 'PROVISIONAL-inherited-for-independent-review', classificationApproved: false };
  });
  const changedPaths = git('diff', '--name-only', '-z', old.sourceHead, expectedHead).toString('utf8').split('\0').filter(Boolean).sort();
  const required = new Set([...Object.keys(old.sourcePins), ...perGate.flatMap(row => row.files),
    ...reviewed.sourcePins.map(row => row.path), ...changedPaths, ...liftedDeclarations.map(row => row.file),
    'scripts/ci/vh-required-gate-roster.json', 'scripts/ci/verification-admission.mjs',
    'package.json', 'package-lock.json', 'scripts/build-reading-module.mjs', 'scripts/build-corridor-site.mjs']);
  const committed = [...required].filter(path => paths.has(path)).sort(), sourcePins = {};
  const packed = execFileSync('git', ['cat-file', '--batch'], { cwd: ROOT,
    input: committed.map(path => `${expectedHead}:${path}\n`).join(''), maxBuffer: 256 * 1024 ** 2 });
  let offset = 0;
  for (const path of committed) {
    const end = packed.indexOf(10, offset), header = packed.subarray(offset, end).toString('utf8');
    const match = header.match(/^[a-f0-9]{40} blob (\d+)$/u); assert(match, `Missing Git input: ${path}`);
    const length = Number(match[1]); sourcePins[path] = sha(packed.subarray(end + 1, end + 1 + length));
    offset = end + length + 2;
  }
  assert.equal(offset, packed.length);
  const dependencyObservations = [...required].filter(path => !paths.has(path) && path.includes('node_modules/')).sort().map(path => {
    const absolute = join(ROOT, path), present = existsSync(absolute);
    if (present) sourcePins[path] = sha(readFileSync(absolute));
    return { path, presentInCandidate: present, observedPath: present ? realpathSync(absolute) : null,
      observedSha256: present ? sourcePins[path] : null, previousSha256: old.sourcePins[path] ?? null };
  });
  // Recheck every prior projection pin, not just the four expected replacements.
  // The old checklist is ancestor evidence; it cannot approve this new head.
  for (const [path, oldPin] of Object.entries(previousDd0.sourcePins)) {
    const expected = i1Paths.includes(path) ? i1Policy.nativeSourcePins[path] : oldPin;
    assert.equal(sourcePins[path], expected, `Unexpected change outside authorized I1 pins: ${path}`);
  }
  for (const row of reviewed.sourcePins) assert.equal(sourcePins[row.path], row.sha256, `Reviewed dd0 input changed: ${row.path}`);
  const i1Replacements = i1Paths.map(path => {
    const donor = join(I1_DONORS, path), expected = i1Policy.nativeSourcePins[path];
    assert.equal(sha(readFileSync(donor)), expected, `I1 donor differs from frozen policy: ${path}`);
    assert.equal(sourcePins[path], expected, `Committed I1 input differs from donor: ${path}`);
    assert.equal(sha(readFileSync(join(ROOT, path))), expected, `Working I1 input differs from donor: ${path}`);
    assert.notEqual(previousDd0.sourcePins[path], expected, `I1 replacement must differ from old dd0: ${path}`);
    return { path, before: previousDd0.sourcePins[path], after: expected, donor: pin(donor) };
  });
  const missingCommittedInputs = [...required].filter(path => !paths.has(path) && !path.includes('node_modules/')).sort();
  const missingCheckoutInputs = [...required].filter(path => !existsSync(join(ROOT, path))).sort();
  const missingTrackedInputs = [...paths].filter(path => !existsSync(join(ROOT, path))).sort();
  const descriptorDelta = descriptors.flatMap(descriptor => {
    const previous = old.descriptors.find(row => row.name === descriptor.name);
    return JSON.stringify(previous) === JSON.stringify(descriptor) ? [] : [{ name: descriptor.name,
      beforeSha256: old.sourceOnlyDescriptorSha256[descriptor.name] ?? null,
      afterSha256: sourceOnlyDescriptorSha256[descriptor.name], before: previous ?? null, after: descriptor }];
  });
  const changedInputs = [...required].sort().filter(path => sourcePins[path] !== old.sourcePins[path]).map(path => ({
    path, before: old.sourcePins[path] ?? null, after: sourcePins[path] ?? null,
    committed: paths.has(path), presentInCheckout: existsSync(join(ROOT, path)),
    addedToClosure: !Object.hasOwn(old.sourcePins, path),
    perGate: perGate.filter(row => row.files.includes(path)).map(row => ({ name: row.name, engineScope: row.engineScope,
      classificationStatus: row.classificationStatus })) }));
  const policyPath = join(TOOLS, 'native-policy.json'), policy = json(policyPath);
  const observedNativePins = Object.fromEntries(Object.keys(policy.nativeSourcePins).map(path => [path,
    existsSync(join(ROOT, path)) ? sha(readFileSync(join(ROOT, path))) : null]));
  const nativeMismatches = Object.entries(policy.nativeSourcePins).filter(([path, expected]) => observedNativePins[path] !== expected)
    .map(([path, expected]) => ({ path, expected, actual: observedNativePins[path] }));
  let actualPolicyAdmission;
  try { currentFootprintPins(TOOLS, ROOT); actualPolicyAdmission = { status: 'passed' }; }
  catch (error) { actualPolicyAdmission = { status: 'blocked', code: error.code ?? null, message: error.message.split('\n')[0] }; }
  assert.equal(actualPolicyAdmission.status, nativeMismatches.length ? 'blocked' : 'passed');
  const after = sourceIdentity(expectedHead, expectedTree); assert.deepEqual(after, before);
  return {
    schemaVersion: 1, kind: 'bunki-full-source-descriptor-projection', preparationOnly: true, approved: false,
    status: 'prepared-source-only-execution-blocked', createdAt: new Date().toISOString(),
    sourceHead: expectedHead, sourceTree: expectedTree, previousHead: old.sourceHead,
    artifactSha256: null, artifactBound: false, artifactStatus: 'UNBUILT: no artifact/site identity or native admission claimed',
    method: 'Actual committed Git declaration AST lifting; current descriptor/closure observations; inherited classifications provisional',
    generator: pin(SELF), previousProjection: pin(OLD), previousDd0Projection: pin(DD0_PROJECTION),
    sourceReview: pin(REVIEW), sourceReviewScope: { reviewedHead: DD0_HEAD, reviewedTree: DD0_TREE,
      relation: 'immediate-parent-ancestor-review', currentHeadApprovedByAncestorReview: false,
      unchangedChecklistPinsVerified: reviewed.sourcePins.length, previousProjectionPinsVerified: Object.keys(previousDd0.sourcePins).length,
      changedPriorPins: i1Paths },
    i1: { authority: pin(I1_AUTHORITY), integrationReceipt: pin(I1_RECEIPT), replacements: i1Replacements,
      affectedSourceReview: 'pending-independent-W2-I1-key; this source preparation is not approval' }, node: pin(NODE),
    parser: pin(require.resolve('typescript')), sourceObservation: { before, after }, liftedDeclarations,
    roster: { canonicalNames: roster.canonicalNames, supplementalNames: roster.supplementalNames, requiredNames: roster.requiredNames },
    streams: old.streams, perGate, dependencies: old.dependencies, globallyExclusive: old.globallyExclusive,
    classificationStatus: 'PROVISIONAL: old source classifications are review input, not current source/artifact approval',
    sourcePins, dependencyObservations, missingCommittedInputs, missingCheckoutInputs, missingTrackedInputs,
    dependencyClosureComplete: false,
    dependencyClosureRequirement: 'Separate complete current tracked/materialization and installed runtime dependency closure records are required; old closure observations and one installed-tool observation are not complete runtime admission.',
    changedInputs, unassociatedChangedInputs: changedInputs.filter(row => !row.perGate.length).map(row => row.path),
    newlyHashCoveredInputsAwaitingGateAttribution: changedInputs.filter(row => row.addedToClosure && !row.perGate.length).map(row => row.path),
    inputAttributionNote: 'The 89 unassociated entries are newly hash-covered inputs awaiting gate attribution, not 89 changed-source issues or defects. unassociatedChangedInputs is retained only as a historical field-name alias; changedInputs also includes additions to the hash inventory.',
    sourceDelta: changedPaths.map(path => ({ path, currentSha256: sourcePins[path] ?? null, committed: paths.has(path) })),
    sourceOnlyDescriptorSha256, descriptors, descriptorDelta,
    deferredArtifactReports: gates.filter(g => g.report && Object.values(g.report).some(value => value === null)).map(g => g.name),
    footprint: { status: actualPolicyAdmission.status === 'blocked' ? 'blocked-native-source-policy-mismatch' : 'unbound-artifact-review-required',
      tools: TOOLS, observedToolPins: Object.fromEntries(TOOL_FILES.map(name => [name, pin(join(TOOLS, name)).sha256])),
      nativePolicy: pin(policyPath), expectedNativePins: policy.nativeSourcePins, observedNativePins, nativeMismatches,
      actualPolicyAdmission, retentionMode: 'keep-all', launchApproved: false },
    counts: { tracked: paths.size, required: gates.length, canonical: roster.canonicalNames.length,
      supplemental: roster.supplementalNames.length, sourceInputs: required.size, committedInputs: committed.length,
      sourcePins: Object.keys(sourcePins).length, changedDescriptors: descriptorDelta.length,
      changedClosureInputs: changedInputs.length, changedSourcePaths: changedPaths.length,
      newlyHashCoveredInputsAwaitingGateAttribution: changedInputs.filter(row => row.addedToClosure && !row.perGate.length).length,
      missingTrackedInputs: missingTrackedInputs.length, missingCheckoutInputs: missingCheckoutInputs.length,
      missingCommittedInputs: missingCommittedInputs.length, nativePolicyMismatches: nativeMismatches.length },
    blockers: ['Fresh artifact/site absent', 'Independent W2 I1 affected-source key pending at preparation', 'Independent current engine/footprint review absent',
      'Inherited per-gate classifications require current review; newly hash-covered inputs need gate attribution',
      'Complete installed runtime dependency closure not established by this projection',
      ...(missingTrackedInputs.length ? ['Incomplete tracked checkout materialization'] : []),
      ...(missingCheckoutInputs.length ? ['Required projection closure inputs absent from checkout'] : []),
      ...(nativeMismatches.length ? ['Unchanged native policy rejects current source'] : [])],
    buildRun: false, nativeRun: false, launchApproved: false,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  assert(args.length === 0 || args.length === 2 && args[0] === '--out'
    && /^source-descriptor-projection-r[1-9][0-9]*\.json$/.test(args[1]),
  'Only a fresh numbered projection filename is selectable; source identity remains fixed');
  const output = join(P, args.length ? args[1] : 'source-descriptor-projection.json');
  assert(!existsSync(output), 'Fresh projection required; historical output cannot be overwritten');
  const result = prepareSourceProjection();
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ path: output, sha256: pin(output).sha256, status: result.status,
    sourceHead: result.sourceHead, sourceTree: result.sourceTree, counts: result.counts,
    artifactBound: false, approved: false, launchApproved: false }));
}

