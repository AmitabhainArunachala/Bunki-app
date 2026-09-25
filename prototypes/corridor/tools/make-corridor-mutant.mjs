/**
 * Named source mutants of a built Corridor site, for negative controls.
 *
 * The copy is an APFS clone (copy-on-write, `cp -Rc`), so a mutant costs little more than the
 * bytes it changes (measured, not assumed; see makeMutant).
 * Each edit must match exactly once. The mutated file's size and digest, the artifact digest
 * (sha256 of the files list, as verifyBundledArtifact computes it) and a `mutant` name are
 * written into build-identity.json, so a suite accepts the copy as what it is — a named
 * mutant of the base commit — and its receipt says so.
 *
 *   import { makeMutant } from './make-corridor-mutant.mjs';
 *   makeMutant({ site, out, name: 'm1', edits: [{ file: 'corridor.js', from, to }] });
 *
 * CLI: node make-corridor-mutant.mjs <site> <out> <name> <from-file> <to-file> [file=corridor.js]
 *      (the from/to text is read from files, so no shell quoting touches it)
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function makeMutant({ site, out, name, edits }) {
  const dir = resolve(out, name);
  if (existsSync(dir)) throw new Error(`${dir} exists; a mutant is never rebuilt in place`);
  // `cp -c` makes an APFS clone (clonefile). Node's cpSync did not clone a recursive tree here:
  // a probe copied 691 MB for real, where `cp -Rc` of the same site measured ~20 MB (2026-09-25).
  execFileSync('cp', ['-Rc', resolve(site), dir]);
  for (const { file = 'corridor.js', from, to } of edits) {
    const path = resolve(dir, file);
    const source = readFileSync(path, 'utf8');
    const count = source.split(from).length - 1;
    if (count !== 1) throw new Error(`${name}: ${file}: expected exactly one match, found ${count}`);
    writeFileSync(path, source.replace(from, to));
  }
  const identityPath = resolve(dir, 'build-identity.json');
  const identity = JSON.parse(readFileSync(identityPath, 'utf8'));
  const touched = new Set(edits.map(({ file = 'corridor.js' }) => file));
  identity.files = identity.files.map((row) => {
    if (!touched.has(row.path)) return row;
    const bytes = readFileSync(resolve(dir, row.path));
    return { ...row, bytes: bytes.length, sha256: sha256(bytes) };
  });
  identity.artifactSha256 = sha256(JSON.stringify(identity.files));
  identity.mutant = name;
  writeFileSync(identityPath, JSON.stringify(identity, null, 2) + '\n');
  return { dir, artifactSha256: identity.artifactSha256 };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const [site, out, name, fromFile, toFile, file = 'corridor.js'] = process.argv.slice(2);
  if (!site || !out || !name || !fromFile || !toFile) {
    throw new Error('Usage: node make-corridor-mutant.mjs <site> <out> <name> <from-file> <to-file> [file]');
  }
  const made = makeMutant({ site, out, name, edits: [{ file, from: readFileSync(fromFile, 'utf8'), to: readFileSync(toFile, 'utf8') }] });
  console.log(JSON.stringify(made));
}
