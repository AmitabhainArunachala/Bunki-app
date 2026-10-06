'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function inventory(root, directory = root) {
  return fs.readdirSync(directory).sort().flatMap((name) => {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    assert(!stat.isSymbolicLink(), 'Bundled assets must not contain symlinks.');
    if (stat.isDirectory()) return inventory(root, file);
    assert(stat.isFile(), 'Bundled assets must be regular files.');
    return [path.relative(root, file).split(path.sep).join('/')];
  });
}

/** Validate portable asset bytes without access to a source checkout or git. */
function verifyBundledArtifact(site) {
  const root = fs.realpathSync(site);
  const actualFiles = inventory(root);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build-identity.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.product, 'KAIRO');
  assert.match(manifest.gitSha, /^[a-f0-9]{40}$/);
  assert.equal(typeof manifest.sourceDirty, 'boolean');
  assert.match(manifest.sourceAssetSha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.artifactSha256, /^[a-f0-9]{64}$/);
  assert(Array.isArray(manifest.files) && manifest.files.length > 0);
  assert.equal(digest(JSON.stringify(manifest.files)), manifest.artifactSha256);
  const names = manifest.files.map((file) => {
    assert.equal(typeof file.path, 'string');
    assert(!file.path.includes('\\') && !file.path.includes('\0') && !path.posix.isAbsolute(file.path));
    assert(file.path.split('/').every((part) => part && part !== '.' && part !== '..'));
    assert(file.path !== 'build-identity.json');
    assert(Number.isSafeInteger(file.bytes) && file.bytes >= 0);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    const bytes = fs.readFileSync(path.join(root, file.path));
    assert.equal(bytes.length, file.bytes, `Asset size mismatch: ${file.path}`);
    assert.equal(digest(bytes), file.sha256, `Asset digest mismatch: ${file.path}`);
    return file.path;
  });
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(actualFiles.filter((name) => name !== 'build-identity.json').sort(), names.sort());
  for (const required of ['index.html', 'sw.js', 'manifest.webmanifest', 'corridor.js']) assert(names.includes(required));
  assert(fs.readFileSync(path.join(root, 'sw.js'), 'utf8').startsWith(
    `self.KAIRO_ASSET_VERSION = ${JSON.stringify(manifest.sourceAssetSha256)};\n`,
  ), 'The worker must carry the canonical asset stamp.');
  return manifest;
}

module.exports = { verifyBundledArtifact };
