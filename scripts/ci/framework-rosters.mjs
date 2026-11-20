/** Reviewed static framework file obligations. Admission never derives them from a receipt or a config. */
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { digest, exactIds } from './verification-admission.mjs';
import { requireFrameworkReceipt } from './framework-receipt.mjs';

const manifest = JSON.parse(
  readFileSync(new globalThis.URL('./framework-rosters.json', import.meta.url), 'utf8'),
);
export const FRAMEWORK_GATES = Object.freeze(Object.keys(manifest.gates));
export const FRAMEWORK_BOUNDARY = manifest.review.boundary;

const sorted = (values) => [...values].sort();
const within = (rel) => Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
const posix = (rel) => rel.split(sep).join('/');

export function frameworkGateRoster(name) {
  assert(Object.hasOwn(manifest.gates, name), `No reviewed framework file roster for ${name}`);
  const gate = manifest.gates[name];
  const universe = manifest.universes[gate.universe];
  assert(universe, `Unknown framework discovery universe for ${name}`);
  return {
    gate: name,
    framework: gate.framework,
    command: gate.command,
    args: [...gate.args],
    cwd: gate.cwd,
    files: sorted(gate.files),
    excludedWholeFiles: sorted(gate.excludedWholeFiles || []),
    universe: {
      name: gate.universe,
      patterns: [...universe.patterns],
      skipDirectories: [...universe.skipDirectories],
      excludePrefixes: [...universe.excludePrefixes],
      files: sorted(universe.files),
    },
  };
}

function globExpression(glob) {
  const parts = glob.split('/');
  let source = '';
  parts.forEach((part, index) => {
    const last = index === parts.length - 1;
    if (part === '**') {
      assert(!last, `Unsupported discovery pattern ${glob}`);
      source += '(?:[^/]+/)*';
      return;
    }
    source +=
      part
        .split('*')
        .map((text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
        .join('[^/]*') + (last ? '' : '/');
  });
  return new RegExp(`^${source}$`, 'u');
}

function requireNoSymlinkPath(top, rel) {
  let path = top;
  for (const part of rel ? rel.split('/') : []) {
    path = join(path, part);
    if (!existsSync(path)) return false;
    assert(!lstatSync(path).isSymbolicLink(), `Framework discovery path is a symlink: ${rel}`);
  }
  return true;
}

export function discoverUniverse(root, universe) {
  const top = realpathSync(root);
  const found = new Set();
  for (const glob of universe.patterns) {
    if (!glob.includes('*')) {
      if (requireNoSymlinkPath(top, glob)) {
        assert(lstatSync(join(top, glob)).isFile(), `Framework test path is not a file: ${glob}`);
        found.add(glob);
      }
      continue;
    }
    const parts = glob.split('/');
    const base = parts
      .slice(
        0,
        parts.findIndex((part) => part.includes('*')),
      )
      .join('/');
    if (!requireNoSymlinkPath(top, base)) continue;
    const expression = globExpression(glob);
    const visit = (rel) => {
      const full = rel ? join(top, rel) : top;
      const stat = lstatSync(full);
      assert(!stat.isSymbolicLink(), `Framework discovery root contains a symlink: ${rel}`);
      if (stat.isDirectory()) {
        for (const name of readdirSync(full).sort())
          if (!universe.skipDirectories.includes(name)) visit(rel ? `${rel}/${name}` : name);
      } else if (
        stat.isFile() &&
        expression.test(rel) &&
        !universe.excludePrefixes.some((prefix) => rel.startsWith(prefix))
      )
        found.add(rel);
    };
    visit(base);
  }
  return sorted(found);
}

export function requireUniverse(root, universe) {
  exactIds(
    universe.files,
    discoverUniverse(root, universe),
    `Reviewed ${universe.name || 'framework'} discovery universe`,
  );
}

export function rootRelativePath(root, path, label = 'Framework path') {
  assert(typeof path === 'string' && isAbsolute(path), `${label} must be absolute: ${path}`);
  const top = realpathSync(root);
  const lexical = [resolve(root), top]
    .map((base) => relative(base, resolve(path)))
    .find((rel) => within(rel));
  assert(lexical !== undefined, `${label} escapes the candidate root: ${path}`);
  assert(existsSync(path), `${label} is missing: ${path}`);
  assert.equal(
    relative(top, realpathSync(path)),
    lexical,
    `${label} resolves through a symlink: ${path}`,
  );
  return posix(lexical);
}

export function requireFrameworkFiles(receipt, { root, files, universe, excludedWholeFiles = [] }) {
  assert(Array.isArray(files) && files.length > 0, 'Empty independent framework file roster');
  requireUniverse(root, universe);
  for (const file of files)
    assert(universe.files.includes(file), `Required file outside its discovery universe: ${file}`);
  if (excludedWholeFiles.length)
    exactIds(
      universe.files,
      [...files, ...excludedWholeFiles],
      'Required and excluded framework files partition the universe',
    );
  const local = (label) => (path) => rootRelativePath(root, path, label);
  exactIds(
    files,
    receipt.scheduledFiles.map(local('Scheduled framework file')),
    'Independent framework scheduled files',
  );
  exactIds(
    files,
    receipt.files.map((row) => local('Reported framework file')(row.path)),
    'Independent framework file evidence',
  );
  const collected = new Map(
    receipt.collected.map((row) => [row.id, local('Collected framework test file')(row.file)]),
  );
  assert.equal(collected.size, receipt.collected.length, 'Duplicate collected framework test');
  exactIds(files, [...new Set(collected.values())], 'Independent framework collected files');
  for (const file of files)
    assert(
      receipt.completed.some((row) => row.status === 'passed' && collected.get(row.id) === file),
      `No completed passing test for required framework file ${file}`,
    );
  return {
    files: sorted(files),
    filesSha256: digest(JSON.stringify(sorted(files))),
    universeSha256: digest(JSON.stringify(sorted(universe.files))),
  };
}

export function requireFrameworkGateReceipt(receipt, { gate, root, out }) {
  const roster = frameworkGateRoster(gate.name);
  requireFrameworkScope(gate, roster, out);
  requireFrameworkReceipt(receipt, roster.framework);
  return {
    framework: receipt.framework,
    gate: gate.name,
    scope: 'file-level',
    tests: receipt.completed.length,
    ...requireFrameworkFiles(receipt, { root, ...roster }),
  };
}

export function requireFrameworkScope(gate, roster, out) {
  assert.equal(gate.name, roster.gate, 'Framework roster belongs to another gate');
  if (roster.command !== null)
    assert.equal(gate.command, roster.command, 'Framework command differs from its reviewed scope');
  assert.equal(gate.cwd || '.', roster.cwd, 'Framework cwd differs from its reviewed scope');
  assert.deepEqual(
    gate.args,
    roster.args.map((arg) => arg.replace('{out}', out)),
    'Framework arguments differ from their reviewed scope',
  );
}
