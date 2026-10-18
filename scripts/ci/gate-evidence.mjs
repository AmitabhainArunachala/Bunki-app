/** Mandatory evidence dispatch. Unknown verifiers have no exit-code fallback. */
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { digest, exactIds, readFreshReceipt, requireNodeSuite } from './verification-admission.mjs';
import { requireFrameworkReceipt } from './framework-receipt.mjs';
import { commandChecks, commandCheckEvidence } from './command-check-contracts.mjs';
import { grammarAcceptance } from '../../prototypes/corridor/tools/vh-word-grammar-contracts.mjs';
import { retainedReportContracts } from './vh-retained-report-contracts.mjs';
import { existingReportContracts } from './vh-existing-report-contracts.mjs';
import { mediaReportContracts } from './vh-media-report-contracts.mjs';
import { visualReportContracts } from './vh-visual-report-contracts.mjs';
import { voiceReportContracts } from './vh-voice-report-contracts.mjs';
import { learningReportContracts } from './vh-learning-report-contracts.mjs';
import { assessmentReportContracts } from './vh-assessment-report-contracts.mjs';
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
  if (['vitest', 'replay', 'export', 'e2e', 'corpus-pytest', 'reading-facets'].includes(gate.name))
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
        : {};
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
    exactIds(
      c.expectedCases(context.engine, context),
      validated.observedCases,
      'Independent adapter case roster',
    );
    obligation = { expectedCases: validated.expectedCases, observedCases: validated.observedCases };
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
      obligation = { files: declaration.files, tests: r.tests.length };
    } else if (kind === 'framework') {
      requireFrameworkReceipt(
        r,
        gate.name === 'e2e'
          ? 'playwright'
          : ['corpus-pytest', 'reading-facets'].includes(gate.name)
            ? 'pytest'
            : 'vitest',
      );
      obligation = { framework: r.framework, tests: r.completed.length };
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
      assert.deepEqual(r.requestedScope.argv, ['--controls']);
      const admission = grammarAcceptance({
        selection: r.requestedScope,
        engines: r.engines,
        rows: r.rows,
        walks: r.walks,
        g6Completed: r.g6Completed,
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
