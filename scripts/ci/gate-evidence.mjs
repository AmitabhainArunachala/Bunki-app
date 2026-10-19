/** Mandatory evidence dispatch. Unknown verifiers have no exit-code fallback. */
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, sep } from 'node:path';
import { digest, exactIds, readFreshReceipt, requireNodeSuite } from './verification-admission.mjs';
import {
  FRAMEWORK_GATES,
  frameworkGateRoster,
  requireFrameworkGateReceipt,
} from './framework-rosters.mjs';
import { commandChecks, commandCheckEvidence } from './command-check-contracts.mjs';
import { grammarAcceptance } from '../../prototypes/corridor/tools/vh-word-grammar-contracts.mjs';
import { retainedReportContracts } from './vh-retained-report-contracts.mjs';
import { existingReportContracts } from './vh-existing-report-contracts.mjs';
import { mediaReportContracts } from './vh-media-report-contracts.mjs';
import { visualReportContracts } from './vh-visual-report-contracts.mjs';
import { voiceReportContracts } from './vh-voice-report-contracts.mjs';
import { learningReportContracts } from './vh-learning-report-contracts.mjs';
import {
  assessmentReportContracts,
  ASSESSMENT_SOURCE_INPUTS,
} from './vh-assessment-report-contracts.mjs';
import { miscReportContracts } from './vh-misc-report-contracts.mjs';
import { deckReportContracts, PERSONAL_SOURCES } from './vh-deck-report-contracts.mjs';
import { PYTHON_REPORTS, validatePythonReport } from './vh-python-report-contracts.mjs';

export const RELEASE_GROUPS = [
  'runner',
  'teaching-reports',
  'search-reports',
  'standalone-reports',
  'artifact-failures',
  'workflows',
  'workflow-failures',
];
const releaseCheckRoster = JSON.parse(
  readFileSync(new globalThis.URL('./vh-release-check-roster.json', import.meta.url), 'utf8'),
);
const adapters = {
  ...retainedReportContracts,
  ...existingReportContracts,
  ...mediaReportContracts,
  ...visualReportContracts,
  ...learningReportContracts,
  ...assessmentReportContracts,
  ...miscReportContracts,
  ...deckReportContracts,
  ...voiceReportContracts,
  ...Object.fromEntries(
    Object.entries(voiceReportContracts)
      .filter(([name]) => name !== 'vh-voice-controls')
      .map(([name, contract]) => [`${name}-webkit`, contract]),
  ),
};
export function registerGateAdapters(entries) {
  for (const [key, value] of Object.entries(entries)) {
    assert(!adapters[key], `Duplicate evidence adapter: ${key}`);
    adapters[key] = value;
  }
}
export function gateEvidenceDeclaration(gate, root, out) {
  const directory = join(out, gate.name);
  if (retainedReportContracts[gate.name]) return { kind: 'adapter', name: gate.name };
  if (gate.report) return { kind: 'retained-report', path: gate.report.path };
  if (commandChecks[gate.name]) return { kind: 'command-check' };
  if (adapters[gate.name]) return { kind: 'adapter', name: gate.name };
  if (PYTHON_REPORTS[gate.name])
    return { kind: 'python', path: join(directory, 'verification-report.json') };
  if (gate.name === 'release-gates')
    return {
      kind: 'release-runner',
      path: join(out, 'runner-verification/verification-report.json'),
    };
  if (gate.name === 'reference-core')
    return { kind: 'reference-core', path: join(directory, 'verification-report.json') };
  if (gate.name === 'official-content-guard')
    return { kind: 'official-content', path: join(directory, 'report.json') };
  if (['word-grammar', 'word-grammar-webkit'].includes(gate.name))
    return { kind: 'word-grammar', path: join(directory, 'verify-word-grammar.json') };
  if (FRAMEWORK_GATES.includes(gate.name))
    return { kind: 'framework', path: join(directory, 'framework.json') };
  const files = gate.args.filter(
    (f) =>
      /\.(?:mjs|cjs|js)$/u.test(f) &&
      !f.startsWith('node_modules/') &&
      existsSync(resolve(root, f)),
  );
  if (
    gate.command === process.execPath &&
    files.length &&
    files.every((f) =>
      /(?:from\s*['"]node:test['"]|require\(['"]node:test['"]\))/u.test(
        readFileSync(resolve(root, f), 'utf8'),
      ),
    )
  ) {
    assert(
      gate.args.every((arg) => arg === '--test' || files.includes(arg)),
      'Unexpected Node test selection',
    );
    return { kind: 'node-test', files, path: join(directory, 'node-suite.json') };
  }
  // Self-tests explicitly declare process-probe fixtures; canonical entries never do.
  if (gate.fixtureReceipt === 'process-probe') return { kind: 'process-probe' };
  throw new Error(`No required evidence contract for ${gate.name}`);
}
export function evidenceInvocation(gate, declaration, root) {
  const env = { ...gate.env };
  let command = gate.command,
    args = [...gate.args];
  if (declaration.kind === 'node-test') {
    args = ['scripts/ci/run-node-suite.mjs', '--out', declaration.path, '--', ...declaration.files];
  } else if (declaration.kind === 'framework') {
    env.KAIRO_FRAMEWORK_RECEIPT = declaration.path;
    if (['vitest', 'replay', 'export'].includes(gate.name))
      args.push('--', '--reporter', resolve(root, 'scripts/ci/vitest-receipt-reporter.mjs'));
    else if (gate.name === 'e2e')
      args.push('--reporter', resolve(root, 'scripts/ci/playwright-receipt-reporter.mjs'));
    else {
      args.push('-p', 'vh_pytest_receipt');
      env.PYTHONPATH = resolve(root, 'scripts/ci');
    }
  }
  return { command, args, env };
}
const rootFiles = (files, root) =>
  files.map((file) => relative(resolve(root), resolve(root, file)).split(sep).join('/'));
const VITEST_GATES = ['vitest', 'replay', 'export'];
const PYTEST_GATES = ['corpus-pytest', 'reading-facets'];
export function requireApprovedInvocation(gate, declaration, actual, root) {
  const declared = { ...gate.env };
  let args = gate.args,
    env = declared,
    instrumentation = 'none';
  if (declaration.kind === 'node-test') {
    assert.deepEqual(
      gate.args.filter((arg) => arg !== '--test'),
      declaration.files,
      'Node test descriptor differs from its declared files',
    );
    args = ['scripts/ci/run-node-suite.mjs', '--out', declaration.path, '--', ...declaration.files];
    instrumentation = 'run-node-suite';
  } else if (declaration.kind === 'framework') {
    env = { ...declared, KAIRO_FRAMEWORK_RECEIPT: declaration.path };
    if (VITEST_GATES.includes(gate.name)) {
      args = [
        ...gate.args,
        '--',
        '--reporter',
        resolve(root, 'scripts/ci/vitest-receipt-reporter.mjs'),
      ];
      instrumentation = 'vitest-receipt-reporter';
    } else if (gate.name === 'e2e') {
      args = [
        ...gate.args,
        '--reporter',
        resolve(root, 'scripts/ci/playwright-receipt-reporter.mjs'),
      ];
      instrumentation = 'playwright-receipt-reporter';
    } else {
      assert(
        PYTEST_GATES.includes(gate.name),
        `No approved framework instrumentation: ${gate.name}`,
      );
      args = [...gate.args, '-p', 'vh_pytest_receipt'];
      env = { ...env, PYTHONPATH: resolve(root, 'scripts/ci') };
      instrumentation = 'vh_pytest_receipt';
    }
  }
  assert.equal(
    actual.command,
    gate.command,
    'Actual command differs from the canonical descriptor',
  );
  assert.deepEqual(
    actual.args,
    args,
    'Actual arguments differ from the canonical descriptor plus approved instrumentation',
  );
  assert.deepEqual(
    actual.env,
    env,
    'Injected environment differs from the canonical descriptor plus approved instrumentation',
  );
  return instrumentation;
}
const shape = (obligation, keys, kind) =>
  assert.deepEqual(
    Object.keys(obligation).sort(),
    [...keys].sort(),
    `Foreign transported obligation shape for ${kind}`,
  );
const positive = (value, label) =>
  assert(Number.isSafeInteger(value) && value > 0, `${label} must be a positive count`);
export function plannedProofContract(gate, root) {
  const declaration = gateEvidenceDeclaration(gate, root, '/planned-proof-contract');
  const kind = declaration.kind;
  let check;
  if (kind === 'command-check') {
    const rule = commandChecks[gate.name],
      inputs = commandCheckEvidence(gate, root).inputs.map((row) => row.path);
    check = (o) => {
      shape(
        o,
        ['kind', 'command', 'args', 'inputs', 'outputs', 'completed', 'processExitCode'],
        kind,
      );
      assert.equal(o.kind, rule.kind, 'Command-check rule kind differs');
      assert.equal(
        o.command,
        gate.command,
        'Transported command-check command differs from its planned gate',
      );
      if (rule.outputArgument) {
        assert(
          Array.isArray(o.args) && o.args.length === gate.args.length,
          'Transported command-check arguments differ',
        );
        for (const [index, arg] of gate.args.entries())
          if (index !== rule.outputArgument)
            assert.equal(o.args[index], arg, 'Transported command-check arguments differ');
        assert(
          typeof o.args[rule.outputArgument] === 'string' &&
            isAbsolute(o.args[rule.outputArgument]),
          'Transported command-check output path must be absolute',
        );
      } else
        assert.deepEqual(
          o.args,
          gate.args,
          'Transported command-check arguments differ from its planned gate',
        );
      assert.equal(o.completed, true, 'Command check did not complete');
      assert.equal(o.processExitCode, 0, 'Command check failed');
      assert(Array.isArray(o.inputs) && Array.isArray(o.outputs) && Array.isArray(o.args));
      exactIds(
        inputs,
        o.inputs.map((row) => row.path),
        'Transported command-check inputs',
      );
      assert(
        o.inputs.every((row) => /^[a-f0-9]{64}$/u.test(row.sha256)),
        'Input digest missing',
      );
    };
  } else if (kind === 'adapter') {
    check = (o) => {
      shape(o, ['adapter', 'expectedCases', 'observedCases'], kind);
      assert.equal(o.adapter, declaration.name, 'Transported adapter belongs to another gate');
      exactIds(o.expectedCases, o.observedCases, 'Transported adapter case roster');
    };
  } else if (kind === 'retained-report') {
    check = (o) => {
      shape(o, ['type'], kind);
      assert.equal(o.type, gate.report.type, 'Transported retained-report type differs');
    };
  } else if (kind === 'node-test') {
    const files = rootFiles(declaration.files, root);
    check = (o) => {
      shape(o, ['files', 'tests'], kind);
      assert.deepEqual(o.files, files, 'Transported Node test files differ from the planned gate');
      positive(o.tests, 'Node test completions');
    };
  } else if (kind === 'framework') {
    const roster = frameworkGateRoster(gate.name);
    check = (o) => {
      shape(
        o,
        ['framework', 'gate', 'scope', 'tests', 'files', 'filesSha256', 'universeSha256'],
        kind,
      );
      assert.equal(o.framework, roster.framework, 'Transported framework differs');
      assert.equal(o.gate, gate.name, 'Transported framework roster belongs to another gate');
      assert.equal(o.scope, 'file-level');
      assert.deepEqual(o.files, roster.files, 'Transported framework files differ');
      assert.equal(o.filesSha256, digest(JSON.stringify(roster.files)));
      assert.equal(o.universeSha256, digest(JSON.stringify(roster.universe.files)));
      positive(o.tests, 'Framework completions');
      assert(o.tests >= roster.files.length, 'Fewer completions than required framework files');
    };
  } else if (kind === 'python') {
    check = (o) => {
      shape(o, ['kind'], kind);
      assert.equal(o.kind, 'python');
    };
  } else if (kind === 'release-runner') {
    check = (o) => {
      shape(o, ['groups'], kind);
      assert.deepEqual(o.groups, RELEASE_GROUPS, 'Transported release groups differ');
    };
  } else if (kind === 'reference-core') {
    const expected = JSON.parse(
      readFileSync(resolve(root, 'scripts/ci/vh-reference-case-roster.json')),
    );
    check = (o) => {
      shape(o, ['expectedCases'], kind);
      assert.deepEqual(o.expectedCases, expected, 'Transported reference roster differs');
    };
  } else if (kind === 'official-content') {
    check = (o) => {
      shape(o, ['scope', 'files'], kind);
      assert.equal(o.scope, 'full repository plus planted fixture controls');
      positive(o.files, 'Official-content scanned files');
    };
  } else if (kind === 'word-grammar') {
    check = (o) => {
      assert.equal(o.fullAcceptance, true, 'Transported word-grammar acceptance incomplete');
      assert.equal(o.controlsVerified, true, 'Transported word-grammar controls unverified');
      assert.deepEqual(o.unverifiedControls, [], 'Transported word-grammar controls unverified');
      exactIds(o.expectedControls, o.observedControls, 'Transported word-grammar controls');
      exactIds(o.expectedWalks, o.observedWalks, 'Transported word-grammar walks');
      exactIds(o.expectedCandidates, o.observedCandidates, 'Transported word-grammar candidates');
    };
  } else throw new Error(`No admissible transported proof contract for ${gate.name} (${kind})`);
  return {
    name: gate.name,
    kind,
    require(proof) {
      assert(proof && typeof proof === 'object', `Transported proof missing for ${gate.name}`);
      assert.equal(
        proof.kind,
        kind,
        `Transported proof kind is not ${gate.name}'s declared ${kind} contract`,
      );
      const o = proof.obligation;
      assert(o && typeof o === 'object' && !Array.isArray(o), 'Transported obligation missing');
      check(o);
      return kind;
    },
  };
}
export function receiptPaths(directory, pattern) {
  const parts = pattern.split('/');
  let paths = [directory];
  for (const part of parts) {
    assert(part !== '..' && part !== '', 'Unsafe receipt glob');
    const expression = new RegExp(
      '^' +
        part
          .split('*')
          .map((s) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
          .join('[^/]*') +
        '$',
      'u',
    );
    paths = paths.flatMap((base) =>
      existsSync(base)
        ? readdirSync(base)
            .filter((n) => expression.test(n))
            .map((n) => join(base, n))
        : [],
    );
  }
  assert.equal(
    paths.length,
    1,
    `Expected exactly one fresh receipt for ${pattern}; got ${paths.length}`,
  );
  assert(!lstatSync(paths[0]).isSymbolicLink(), 'Receipt symlink rejected');
  return paths[0];
}
export function validateGateEvidence(gate, declaration, context, retainedValidator) {
  const receipts = [];
  const read = (path) => {
    const full = resolve(path),
      rel = relative(context.out, full);
    assert(rel && !rel.startsWith('..') && !isAbsolute(rel), 'Receipt outside this run');
    let ancestor = resolve(context.out);
    for (const part of rel.split('/')) {
      ancestor = join(ancestor, part);
      assert(!lstatSync(ancestor).isSymbolicLink(), 'Receipt ancestor symlink rejected');
    }
    const realRel = relative(realpathSync(context.out), realpathSync(full));
    assert(
      realRel && !realRel.startsWith('..') && !isAbsolute(realRel),
      'Receipt resolves outside this run',
    );
    const r = readFreshReceipt(full, {
      ...context,
      requireNonce: [
        'node-test',
        'framework',
        'python',
        'release-runner',
        'reference-core',
        'word-grammar',
      ].includes(declaration.kind),
    });
    receipts.push({ path: full, sha256: r.sha256, bytes: r.bytes });
    return r.value;
  };
  const kind = declaration.kind;
  let obligation;
  if (kind === 'command-check') {
    obligation = commandCheckEvidence(gate, context.root, {
      completed: true,
      exitCode: context.processExitCode,
    });
    assert.deepEqual(
      obligation.inputs,
      context.commandBefore.inputs,
      'Command source/configuration changed while running',
    );
  } else if (kind === 'process-probe') {
    assert.equal(context.processExitCode, 0);
    obligation = { kind: 'test-only-process-probe' };
  } else if (kind === 'adapter') {
    const c = adapters[declaration.name];
    const sourceFiles =
      gate.name === 'personal-collections-contract'
        ? Object.fromEntries(
            PERSONAL_SOURCES.map((file) => [
              file,
              digest(readFileSync(resolve(context.root, 'prototypes/corridor/tools', file))),
            ]),
          )
        : Object.fromEntries(
            (ASSESSMENT_SOURCE_INPUTS[gate.name] || []).map((file) => [
              file,
              digest(readFileSync(resolve(context.root, file))),
            ]),
          );
    const producerHash =
      c.producer && existsSync(resolve(context.root, c.producer))
        ? digest(readFileSync(resolve(context.root, c.producer)))
        : context.verifierSha256;
    const paths = c.paths.map((p) =>
      p === 'stdout.json' ? context.stdoutPath : receiptPaths(join(context.out, gate.name), p),
    );
    const values = paths.map(read);
    const validated = c.validate(values[0], {
      ...context,
      sourceFiles,
      verifierSha256: producerHash,
      gateId: gate.name,
      args: gate.args,
      argv: gate.args,
      readReport: (path) => {
        const file = isAbsolute(path) ? path : join(context.out, gate.name, path);
        const rel = relative(join(context.out, gate.name), file);
        assert(
          rel && !rel.startsWith('..') && !isAbsolute(rel),
          'Child receipt outside gate attempt',
        );
        return read(file);
      },
    });
    assert.equal(
      validated.passed,
      true,
      validated.errors?.join('; ') || 'Producer receipt rejected',
    );
    const expectedCases = c.expectedCases(context.engine, context);
    exactIds(expectedCases, validated.observedCases, 'Independent adapter case roster');
    obligation = {
      adapter: declaration.name,
      expectedCases,
      observedCases: validated.observedCases,
    };
  } else {
    let path = declaration.path;
    if (kind === 'retained-report' && gate.report.type === 'offline')
      path = receiptPaths(path, 'run-*/receipt.json');
    const r = read(path);
    if (kind === 'retained-report') {
      retainedValidator(gate.report);
      obligation = { type: gate.report.type };
    } else if (kind === 'node-test') {
      requireNodeSuite(r, declaration.files, context.root);
      obligation = { files: rootFiles(declaration.files, context.root), tests: r.tests.length };
    } else if (kind === 'framework') {
      obligation = requireFrameworkGateReceipt(r, { gate, root: context.root, out: context.out });
    } else if (kind === 'python') {
      validatePythonReport(r, {
        gateId: gate.name,
        runId: context.runId,
        gitSha: context.gitSha,
        root: context.root,
      });
      obligation = { kind };
    } else if (kind === 'release-runner') {
      exactIds(
        RELEASE_GROUPS,
        r.groups.map((g) => g.id),
        'Release verifier groups',
      );
      for (const expected of releaseCheckRoster)
        exactIds(
          expected.checks,
          r.groups.find((g) => g.id === expected.id)?.checks,
          'Release ' + expected.id + ' checks',
        );
      exactIds(
        releaseCheckRoster.flatMap((g) => g.checks),
        r.checks,
        'Release checks',
      );
      assert.equal(r.passed, r.checks.length);
      obligation = { groups: RELEASE_GROUPS };
    } else if (kind === 'reference-core') {
      const expected = JSON.parse(
        readFileSync(resolve(context.root, 'scripts/ci/vh-reference-case-roster.json')),
      );
      exactIds(
        expected,
        r.checks.map((c) => c.name),
        'Reference cases',
      );
      assert(
        r.checks.every((c) => c.passed === true) &&
          r.fullAcceptance &&
          r.coverageParity &&
          r.relationshipParity,
      );
      assert.equal(r.verifierSha256, context.verifierSha256);
      obligation = { expectedCases: expected };
    } else if (kind === 'official-content') {
      assert.equal(r.verdict, 'pass');
      assert.equal(r.selfTest.cleanScratchPassed, true);
      assert.equal(r.selfTest.plantedFixturesCaught, true);
      assert.equal(r.scan.target, 'repository (tracked and unignored files)');
      assert(r.scan.files > 0);
      assert.deepEqual(r.scan.findings, []);
      obligation = { scope: 'full repository plus planted fixture controls', files: r.scan.files };
    } else if (kind === 'word-grammar') {
      assert.equal(r.runId, context.runId);
      assert.equal(r.artifactSha256, context.artifactSha256);
      assert.equal(r.verifierSha256, context.verifierSha256);
      exactIds([context.engine], r.engines, 'Word-grammar engines');
      assert(
        typeof r.browserVersions?.[context.engine] === 'string' &&
          r.browserVersions[context.engine].length > 0,
        'Word-grammar browser version missing',
      );
      assert.equal(gate.args[0], gate.requiredPath, 'Word-grammar invocation is not its verifier');
      const argv = gate.args.slice(1);
      assert.deepEqual(argv, ['--controls'], 'Word-grammar gate is not the full control schedule');
      assert.deepEqual(r.requestedScope?.argv, argv, 'Word-grammar receipt argv differs');
      assert(
        Array.isArray(context.runtimeFiles) && context.runtimeFiles.length > 0,
        'Word-grammar controls need the served artifact manifest',
      );
      const admission = grammarAcceptance({
        argv,
        engines: r.engines,
        rows: r.rows,
        walks: r.walks,
        g6Completed: r.g6Completed,
        controls: r.controls,
        runtimeFiles: context.runtimeFiles,
      });
      assert.equal(
        admission.fullAcceptance,
        true,
        'Every G1–G6 candidate and control must complete',
      );
      assert.equal(r.fullAcceptance, true);
      obligation = admission;
    } else throw new Error(`Unimplemented evidence contract ${kind}`);
  }
  return { kind, receipts, obligation };
}
