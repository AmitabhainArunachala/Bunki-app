/** Read the compiler-produced core modules named by the caller from an immutable
 * staged artifact. Authored seam modules are intentionally outside this
 * inventory: only the canonical compiler cores require `identity.modules` rows. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const inside = (parent, child) => {
  const part = relative(parent, child);
  return !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
};

function artifactPath(siteRoot, path, label) {
  assert.equal(typeof path, 'string', `${label} path must be a string`);
  assert(path.length > 0, `${label} path must not be empty`);
  assert(!isAbsolute(path), `${label} path must stay relative: ${path}`);
  const resolved = resolve(siteRoot, path);
  assert(
    inside(siteRoot, resolved) && resolved !== siteRoot,
    `${label} path escapes the staged artifact: ${path}`,
  );
  return resolved;
}

/** Return each required compiler core's exact metadata row with its verified
 * staged bytes. Missing, duplicate, escaping or changed rows fail closed before
 * the caller imports or executes anything. */
export function readCompiledModuleInventory(siteRoot, identity, requiredPaths) {
  assert.equal(typeof siteRoot, 'string', 'Compiled inventory needs a staged site root');
  const root = resolve(siteRoot);
  assert(
    identity && typeof identity === 'object' && !Array.isArray(identity),
    'Compiled inventory needs a build identity object',
  );
  assert(Array.isArray(identity.files), 'Build identity needs its manifest files');
  assert(Array.isArray(identity.modules), 'Build identity needs its compiled module metadata');
  assert(
    Array.isArray(requiredPaths) && requiredPaths.length > 0,
    'Compiled inventory needs at least one required core path',
  );
  assert.equal(
    new Set(requiredPaths).size,
    requiredPaths.length,
    'Compiled inventory required paths must be unique',
  );

  // Validate every recorded metadata path before matching so an escaping row
  // fails even when it no longer names a required core.
  for (const row of identity.modules) {
    assert(
      row && typeof row === 'object' && !Array.isArray(row),
      'Compiler metadata rows must be objects',
    );
    artifactPath(root, row.path, 'Compiler metadata');
  }
  assert.equal(
    new Set(identity.modules.map((row) => row.path)).size,
    identity.modules.length,
    'Compiler metadata paths must be unique',
  );

  return requiredPaths.map((path) => {
    const source = artifactPath(root, path, 'Compiled module');
    const files = identity.files.filter((file) => file && file.path === path);
    assert.equal(files.length, 1, `Compiled module needs exactly one manifest entry: ${path}`);
    const metadata = identity.modules.filter((row) => row.path === path);
    assert.equal(
      metadata.length,
      1,
      `Compiled module needs exactly one compiler metadata row: ${path}`,
    );
    const file = files[0];
    const row = metadata[0];
    assert(
      row.compiler && typeof row.compiler === 'object' && !Array.isArray(row.compiler),
      `Compiled module compiler provenance is missing: ${path}`,
    );
    assert(
      Array.isArray(row.inputs),
      `Compiled module compiler inputs are missing: ${path}`,
    );
    assert.match(file.sha256 || '', /^[a-f0-9]{64}$/u, `Compiled module digest is invalid: ${path}`);
    assert(
      Number.isSafeInteger(file.bytes) && file.bytes >= 0,
      `Compiled module byte count is invalid: ${path}`,
    );
    const bytes = readFileSync(source);
    assert.equal(bytes.length, file.bytes, `Compiled module byte count changed: ${path}`);
    assert.equal(sha256(bytes), file.sha256, `Compiled module digest changed: ${path}`);
    return { ...row, bytes };
  });
}
