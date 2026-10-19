/** Only compiler, syntax, formatting and generated-byte checks belong here.
 * Behavioral verifiers must supply actual named completion receipts instead. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { digest } from './verification-admission.mjs';

export const commandChecks = Object.freeze({
  'format-check': {
    command: 'npm',
    args: ['run', 'format:check'],
    kind: 'formatter',
    inputs: ['package.json', 'package-lock.json'],
  },
  lint: {
    command: 'npm',
    args: ['run', 'lint'],
    kind: 'linter',
    inputs: ['package.json', 'package-lock.json'],
  },
  'corridor-lint': {
    first: 'node_modules/eslint/bin/eslint.js',
    kind: 'linter',
    inputs: ['scripts/corridor-eslint.config.mjs'],
  },
  typecheck: {
    command: 'npm',
    args: ['run', 'typecheck'],
    kind: 'compiler',
    inputs: ['package.json', 'package-lock.json', 'tsconfig.json'],
  },
  'reference-data': {
    first: 'tools/build-reference-data.mjs',
    tail: ['--check'],
    kind: 'generated-byte-parity',
    inputs: ['prototypes/corridor/data/share_alike/reference-extra.json'],
  },
  'drift-layer-generated': {
    first: 'prototypes/corridor/tools/build-drift-layer.mjs',
    tail: ['--check'],
    kind: 'generated-byte-parity',
    inputs: ['prototypes/corridor/drift-layer.js', 'prototypes/corridor/drift-layer.css'],
  },
  'bundled-listening-catalog': {
    first: 'prototypes/corridor/tools/build-listening-cues.mjs',
    tail: ['--check'],
    kind: 'generated-byte-parity',
    inputs: ['prototypes/corridor/audio/sentence-cues.json'],
  },
  'deck-frozen-build': {
    first: 'scripts/ci/deck-frozen.mjs',
    tail: [],
    kind: 'frozen-build-parity',
    inputs: ['scripts/ci/supplemental.mjs', 'decks/kotoba-mine/tools/build.py'],
  },
  'runtime-syntax': {
    first: 'scripts/ci/runtime-syntax.mjs',
    tail: [],
    kind: 'syntax',
    inputs: [
      'reference-core.js',
      'reference-ui.js',
      'corridor.js',
      'skip-core.js',
      'skip-ui.js',
    ].map((f) => `prototypes/corridor/${f}`),
  },
  'e2e-build': {
    command: 'npm',
    args: ['run', 'test:e2e:build'],
    kind: 'compiler-output',
    inputs: ['package.json', 'apps/app/package.json'],
    outputs: ['apps/app/dist/index.html'],
  },
  'standalone-build': {
    first: 'prototypes/corridor/tools/build-standalone.mjs',
    kind: 'compiler-output',
    inputs: [],
    outputArgument: 1,
  },
});
export function commandCheckEvidence(gate, root, { completed = false, exitCode = null } = {}) {
  const rule = commandChecks[gate.name];
  assert(rule, 'No command-check contract');
  if (rule.command) assert.equal(gate.command, rule.command);
  else assert.equal(gate.command, process.execPath);
  if (rule.args) assert.deepEqual(gate.args, rule.args, 'Declared compiler invocation changed');
  if (rule.first) assert.equal(gate.args[0], rule.first);
  if (rule.tail) assert.deepEqual(gate.args.slice(1), rule.tail);
  if (gate.name === 'corridor-lint') {
    assert.deepEqual(gate.args.slice(1, 4), [
      '--no-ignore',
      '--config',
      'scripts/corridor-eslint.config.mjs',
    ]);
    assert(
      gate.args.length > 4 && gate.args.slice(4).every((f) => f.startsWith('prototypes/corridor/')),
    );
  }
  if (rule.outputArgument) assert.equal(gate.args.length, 2);
  const files = [
    ...new Set([
      ...rule.inputs,
      ...(rule.first ? [rule.first] : []),
      ...gate.args.filter((f) => /\.(?:mjs|cjs|js|json)$/u.test(f) && existsSync(resolve(root, f))),
    ]),
  ];
  assert(files.length, 'No command source/configuration inputs');
  const inputs = files.map((file) => ({
    path: file,
    sha256: digest(readFileSync(resolve(root, file))),
  }));
  const outputs = completed
    ? [
        ...(rule.outputs || []),
        ...(rule.outputArgument
          ? [gate.args[rule.outputArgument], `${gate.args[rule.outputArgument]}.build.json`]
          : []),
      ].map((file) => {
        const path = resolve(root, file),
          bytes = readFileSync(path);
        assert(bytes.length, `Empty build output: ${file}`);
        return { path: file, bytes: bytes.length, sha256: digest(bytes) };
      })
    : [];
  if (completed) assert.equal(exitCode, 0, 'Compiler/check process failed');
  return {
    kind: rule.kind,
    command: gate.command,
    args: gate.args,
    inputs,
    outputs,
    completed,
    processExitCode: exitCode,
  };
}
