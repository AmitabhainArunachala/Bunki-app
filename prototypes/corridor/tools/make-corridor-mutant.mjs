/**
 * Named TEST MUTATIONS of an independently verified Corridor build, for negative controls only.
 * (B2-TEST-REVIEW-r1 §1, B2-MUTANT-REVIEW-r2 §1–5.)
 *
 * A mutant is a derived test artifact, never a build. Its build-identity.json is REPLACED by a
 * `kairo-test-mutation` record whose product is KAIRO-TEST-MUTANT, so no release check
 * (verifyBundledArtifact, verifyArtifact, the service worker) accepts it as KAIRO, and it never
 * claims a clean source build. A verifier accepts it only through verifyTestMutant() with the
 * record's pinned mutationSha256. The record binds:
 *   base       the validated base manifest — product, gitSha, sourceDirty, sourceAssetSha256,
 *              artifactSha256 and the digest of its build-identity.json bytes. These are the BASE's
 *              claims, kept as provenance; they are not claims about the mutated bytes.
 *   mutation   every literal edit: file, from, to, their digests and the match offset;
 *   results    each touched file's bytes/sha256 before and after;
 *   files      the mutant's complete inventory, and mutantFilesSha256 over it;
 *   generator  this file's sha256 (a mutant made by another generator version is refused);
 * and mutationSha256, the sha256 of the canonical record without that field. The file-list digest
 * alone would not cover the record (build-identity.json is outside it), so the pin is the record's.
 *
 * Order (all-or-nothing): validate the base against its pinned digest and simulate every edit in
 * memory BEFORE anything is created; then confine and reserve <out>/<name> exclusively, check free
 * space, copy, write only owned regular files (no symlink is followed), validate the whole copied
 * tree against the plan, and only then publish <out>/<name>/site by rename. On failure only the
 * staging copy this call made is removed; <out>/<name>/INCOMPLETE.json says why, and the name stays
 * reserved (a failed name is never reused or overwritten).
 *
 * Storage: the copy is `cp -Rc`. macOS falls back SILENTLY to a full copy when cloning is not
 * possible (another filesystem, non-APFS), so the cost is NOT bounded by the edit. The helper
 * refuses unless free space minus the base's full size stays above a 25 GiB floor, and records the
 * figures. It must not be run while the machine is below that floor.
 *
 *   import { makeMutant, verifyTestMutant } from './make-corridor-mutant.mjs';
 *   makeMutant({ baseSite, baseArtifactSha256, outRoot, name: 'm1', edits: [{ file: 'corridor.js', from, to }] });
 *
 * CLI: node make-corridor-mutant.mjs <base-site> <base-artifact-sha256> <out-root> <name> <from-file> <to-file> [file=corridor.js]
 *      (the from/to text is read from files, so no shell quoting touches it)
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync,
  renameSync, rmSync, statfsSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { verifyBundledArtifact } = require('../../bunki-desktop/lib/artifact.cjs');

export const MUTANT_PRODUCT = 'KAIRO-TEST-MUTANT';
export const MUTATION_FORMAT = 'kairo-test-mutation';
export const FREE_SPACE_FLOOR_BYTES = 25 * 1024 ** 3;
const SELF = fileURLToPath(import.meta.url);
const REPO = realpathSync(resolve(dirname(SELF), '../../..'));
const GENERATOR_PATH = relative(REPO, SELF).split(sep).join('/');
const NAME = /^[a-z][a-z0-9-]{0,31}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_EDITS = 8;
const MAX_EDIT_TEXT = 4096;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const generatorSha256 = () => sha256(readFileSync(SELF));
/** Sorted-key JSON, so the pinned digest does not depend on property order. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const inside = (parent, child) => {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};
function canonical(path) {
  let existing = resolve(path);
  while (!existsSync(existing)) existing = dirname(existing);
  return resolve(realpathSync(existing), relative(existing, resolve(path)));
}
function canonicalRelative(file) {
  return typeof file === 'string' && file.length > 0 && file.length <= 512 && !file.includes('\\') && !file.includes('\0')
    && !posix.isAbsolute(file) && posix.normalize(file) === file
    && file.split('/').every((part) => part && part !== '.' && part !== '..');
}
/** Every occurrence, overlapping ones included: "exactly one match" must not be fooled by overlap. */
function occurrences(text, needle) {
  const at = [];
  for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + 1)) at.push(index);
  return at;
}

const validatedBases = new WeakSet();
/** Validate a base artifact against its pinned digest. The result is branded: makeMutant accepts
 * only an object produced here, never a hand-built one. */
export function validateBase(baseSite, baseArtifactSha256) {
  assert(typeof baseSite === 'string' && isAbsolute(baseSite), 'The base site must be an absolute path');
  assert.match(String(baseArtifactSha256), DIGEST, 'The base artifact digest must be pinned (64 hex)');
  const root = realpathSync(baseSite);
  assert(lstatSync(root).isDirectory(), 'The base site must be a directory');
  // full portable validation: inventory, no symlinks, regular files, byte counts, digests, aggregate
  const manifest = verifyBundledArtifact(root);
  assert.equal(manifest.artifactSha256, baseArtifactSha256, 'The base differs from its pinned artifact digest');
  assert.equal(manifest.product, 'KAIRO');
  for (const marker of ['mutant', 'testMutation', 'format', 'mutationSha256'])
    assert(!Object.hasOwn(manifest, marker), `The base already carries a mutation marker (${marker}); mutate a clean base only`);
  const manifestBytes = readFileSync(join(root, 'build-identity.json'));
  const base = Object.freeze({
    root, manifest, manifestBytes, manifestSha256: sha256(manifestBytes),
    byPath: new Map(manifest.files.map((row) => [row.path, row])),
    totalBytes: manifest.files.reduce((sum, row) => sum + row.bytes, 0) + manifestBytes.length,
  });
  validatedBases.add(base);
  return base;
}

/** Validate and simulate every edit in memory. Nothing is written. */
export function planMutation({ base, name, edits }) {
  assert(validatedBases.has(base), 'planMutation needs a base returned by validateBase');
  assert(typeof name === 'string' && NAME.test(name), `A mutant name is one lowercase path component (${NAME})`);
  assert(Array.isArray(edits) && edits.length > 0 && edits.length <= MAX_EDITS, `Between 1 and ${MAX_EDITS} edits`);
  const texts = new Map();
  const before = new Map();
  const recorded = [];
  for (const edit of edits) {
    assert(edit && typeof edit === 'object', 'An edit is an object');
    const { file = 'corridor.js', from, to } = edit;
    assert(canonicalRelative(file), `Edit path must be a canonical relative path: ${JSON.stringify(file)}`);
    assert(file !== 'build-identity.json', 'build-identity.json is never an edit target');
    const row = base.byPath.get(file);
    assert(row, `Edit path is not an asset of the base manifest: ${file}`);
    assert(typeof from === 'string' && from.length > 0 && from.length <= MAX_EDIT_TEXT, 'from must be a non-empty bounded string');
    assert(typeof to === 'string' && to.length <= MAX_EDIT_TEXT, 'to must be a bounded string');
    assert.notEqual(from, to, 'An edit must change something');
    if (!texts.has(file)) {
      const bytes = readFileSync(join(base.root, ...file.split('/')));
      assert.equal(sha256(bytes), row.sha256, `Base file changed after validation: ${file}`);
      const text = bytes.toString('utf8');
      assert(Buffer.from(text, 'utf8').equals(bytes), `Not UTF-8 text, refused: ${file}`);
      texts.set(file, text);
      before.set(file, { bytes: bytes.length, sha256: row.sha256 });
    }
    const text = texts.get(file);
    const at = occurrences(text, from);
    assert.equal(at.length, 1, `${name}: ${file}: expected exactly one match, found ${at.length}`);
    // literal: a replacement CALLBACK, so $&, $1 or $' in `to` are never expanded
    const next = text.replace(from, () => to);
    assert.equal(next, text.slice(0, at[0]) + to + text.slice(at[0] + from.length), 'Literal replacement mismatch');
    texts.set(file, next);
    recorded.push({ file, from, to, fromSha256: sha256(Buffer.from(from, 'utf8')), toSha256: sha256(Buffer.from(to, 'utf8')), offset: at[0] });
  }
  const writes = new Map();
  const results = [];
  for (const [file, text] of texts) {
    const bytes = Buffer.from(text, 'utf8');
    assert.notEqual(sha256(bytes), before.get(file).sha256, `${name}: ${file}: the edits leave the bytes unchanged`);
    writes.set(file, bytes);
    results.push({ path: file, before: before.get(file), after: { bytes: bytes.length, sha256: sha256(bytes) } });
  }
  const files = base.manifest.files.map((row) => {
    const bytes = writes.get(row.path);
    return bytes ? { path: row.path, bytes: bytes.length, sha256: sha256(bytes) } : { path: row.path, bytes: row.bytes, sha256: row.sha256 };
  });
  const record = {
    schemaVersion: 1, product: MUTANT_PRODUCT, format: MUTATION_FORMAT, formatVersion: 1,
    name, derived: true, cleanBuild: false,
    statement: 'A test mutation of the base artifact named below. These bytes are not a build of base.gitSha and carry none of its release claims.',
    base: {
      product: base.manifest.product, gitSha: base.manifest.gitSha, sourceDirty: base.manifest.sourceDirty,
      sourceAssetSha256: base.manifest.sourceAssetSha256, artifactSha256: base.manifest.artifactSha256,
      manifestSha256: base.manifestSha256,
    },
    mutation: { edits: recorded },
    results,
    files,
    mutantFilesSha256: sha256(JSON.stringify(files)),
    generator: { path: GENERATOR_PATH, sha256: generatorSha256() },
  };
  record.mutationSha256 = sha256(canonicalJson(record));
  return { record, writes, before };
}

function inventory(root, directory = root) {
  return readdirSync(directory).sort().flatMap((name) => {
    const file = join(directory, name);
    const stat = lstatSync(file);
    assert(!stat.isSymbolicLink(), `A mutant tree must not contain symlinks: ${file}`);
    if (stat.isDirectory()) return inventory(root, file);
    assert(stat.isFile(), `A mutant tree holds regular files only: ${file}`);
    return [relative(root, file).split(sep).join('/')];
  });
}
/** Hash the whole tree and require exactly the planned inventory and identity record. */
function checkTree(root, record) {
  const identityBytes = readFileSync(join(root, 'build-identity.json'));
  assert.equal(canonicalJson(JSON.parse(identityBytes.toString('utf8'))), canonicalJson(record), 'The identity record on disk is not the planned record');
  const paths = inventory(root).filter((path) => path !== 'build-identity.json');
  const planned = new Map(record.files.map((row) => [row.path, row]));
  assert.equal(paths.length, planned.size, 'The mutant inventory differs from the planned inventory');
  for (const path of paths) {
    const row = planned.get(path);
    assert(row, `Unplanned file in the mutant: ${path}`);
    const bytes = readFileSync(join(root, ...path.split('/')));
    assert(bytes.length === row.bytes && sha256(bytes) === row.sha256, `Mutant file differs from the plan: ${path}`);
  }
  return sha256(identityBytes);
}

/** Accept a mutant only as what it is: recompute the plan from the independently validated base and
 * the record's own edits, require the record to be exactly that plan, require the pinned digest,
 * and hash every file. Used by the verifier's mutant path and the adjudicator. */
export function verifyTestMutant({ baseSite, mutantSite, expectedMutationSha256, expectedName } = {}) {
  assert.match(String(expectedMutationSha256), DIGEST, 'A test mutant is accepted only against its pinned mutationSha256');
  assert(typeof mutantSite === 'string' && isAbsolute(mutantSite), 'The mutant site must be an absolute path');
  const root = realpathSync(mutantSite);
  assert(lstatSync(root).isDirectory(), 'The mutant site must be a directory');
  const identity = lstatSync(join(root, 'build-identity.json'));
  assert(identity.isFile() && !identity.isSymbolicLink(), 'The mutant identity must be a regular file');
  const record = JSON.parse(readFileSync(join(root, 'build-identity.json'), 'utf8'));
  assert.equal(record.product, MUTANT_PRODUCT, 'Not a test mutation record');
  assert.equal(record.format, MUTATION_FORMAT);
  assert.equal(record.formatVersion, 1);
  assert.equal(record.cleanBuild, false);
  if (expectedName !== undefined) assert.equal(record.name, expectedName, 'Unexpected mutant name');
  assert.equal(record.mutationSha256, expectedMutationSha256, 'The mutant differs from its pinned mutation digest');
  const base = validateBase(baseSite, record.base?.artifactSha256);
  assert(!inside(base.root, root) && !inside(root, base.root), 'The mutant and its base must be disjoint trees');
  const edits = (record.mutation?.edits || []).map(({ file, from, to }) => ({ file, from, to }));
  const { record: planned } = planMutation({ base, name: record.name, edits });
  assert.equal(canonicalJson(record), canonicalJson(planned), 'The mutation record is not exactly what its base, edits and generator produce');
  const identitySha256 = checkTree(root, record);
  return {
    name: record.name, site: root, mutationSha256: record.mutationSha256, mutantFilesSha256: record.mutantFilesSha256,
    identitySha256, base: { ...record.base, site: base.root },
    edits: record.mutation.edits.map(({ file, from, to, fromSha256, toSha256, offset }) => ({ file, from, to, fromSha256, toSha256, offset })),
    results: record.results, files: new Map(record.files.map((row) => [row.path, row.sha256])),
  };
}

function authorizedOutRoot(outRoot, baseRoot) {
  assert(typeof outRoot === 'string' && isAbsolute(outRoot), 'The output root must be an absolute path');
  const out = canonical(outRoot);
  const roots = [join(homedir(), '.dharma')];
  if (process.env.CI && process.env.RUNNER_TEMP) roots.push(process.env.RUNNER_TEMP);
  assert(roots.some((root) => inside(canonical(root), out)), 'Mutants are written only under ~/.dharma (or CI RUNNER_TEMP)');
  assert(!inside(REPO, out), 'Mutants are never written into the checkout');
  assert(!inside(baseRoot, out) && !inside(out, baseRoot), 'The output root and the base must be disjoint');
  return out;
}
function freeBytes(path) {
  let existing = path;
  while (!existsSync(existing)) existing = dirname(existing);
  const stats = statfsSync(existing);
  return Number(stats.bavail) * Number(stats.bsize);
}
/** Write into a file of the owned tree: every parent is a real directory, the leaf a regular file
 * holding the expected bytes, and the open refuses to follow a leaf symlink. */
function writeOwnedFile(root, path, bytes, expectedSha256) {
  const parts = path.split('/');
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = join(current, part);
    const stat = lstatSync(current);
    assert(stat.isDirectory() && !stat.isSymbolicLink(), `Not an owned directory: ${current}`);
  }
  const file = join(current, parts.at(-1));
  const stat = lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink(), `Not an owned regular file: ${file}`);
  assert.equal(sha256(readFileSync(file)), expectedSha256, `The copy differs from the validated base: ${path}`);
  const fd = openSync(file, constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW);
  try { writeFileSync(fd, bytes); } finally { closeSync(fd); }
}

/** Create one named test mutant. Either pass a `base` from validateBase() or `baseSite` plus
 * `baseArtifactSha256`. Returns only after the published tree has been validated. */
export function makeMutant({ base, baseSite, baseArtifactSha256, outRoot, name, edits }) {
  const validated = base ?? validateBase(baseSite, baseArtifactSha256);
  const plan = planMutation({ base: validated, name, edits });
  const out = authorizedOutRoot(outRoot, validated.root);
  const free = freeBytes(out);
  const headroom = free - validated.totalBytes;
  assert(headroom >= FREE_SPACE_FLOOR_BYTES,
    `Refused: a full (non-clone) copy of ${validated.totalBytes} bytes would leave ${headroom} bytes, below the ${FREE_SPACE_FLOOR_BYTES}-byte floor`);
  mkdirSync(out, { recursive: true });
  assert.equal(realpathSync(out), out, 'The output root resolved through a link after creation');
  const owned = join(out, name);
  mkdirSync(owned); // exclusive reservation: EEXIST for any existing entry, a dangling symlink included
  const staging = join(owned, '.staging-site');
  const site = join(owned, 'site');
  try {
    execFileSync('cp', ['-Rc', validated.root, staging], { stdio: ['ignore', 'ignore', 'pipe'] });
    const stat = lstatSync(staging);
    assert(stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(staging) === staging, 'The copy is not an owned directory');
    for (const [path, bytes] of plan.writes) writeOwnedFile(staging, path, bytes, plan.before.get(path).sha256);
    writeOwnedFile(staging, 'build-identity.json', Buffer.from(`${JSON.stringify(plan.record, null, 2)}\n`), validated.manifestSha256);
    checkTree(staging, plan.record);
    renameSync(staging, site);
    const summary = {
      name, site, mutationSha256: plan.record.mutationSha256, mutantFilesSha256: plan.record.mutantFilesSha256,
      base: { site: validated.root, artifactSha256: validated.manifest.artifactSha256 },
      copy: { command: 'cp -Rc', note: 'clone requested; macOS may have made a full copy', baseBytes: validated.totalBytes, freeBefore: free },
    };
    writeFileSync(join(owned, 'mutation.json'), `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
    return summary;
  } catch (error) {
    // custody: remove only what this call created, and leave the reservation with its reason
    for (const path of [staging, site]) {
      const stat = lstatSync(path, { throwIfNoEntry: false });
      if (stat?.isDirectory() && !stat.isSymbolicLink()) rmSync(path, { recursive: true, force: true });
    }
    try {
      writeFileSync(join(owned, 'INCOMPLETE.json'), `${JSON.stringify({ name, error: String(error?.message || error), at: new Date().toISOString() }, null, 2)}\n`, { flag: 'wx' });
    } catch { /* the thrown error below is the record */ }
    throw error;
  }
}

const invokedDirectly = (() => {
  try { return !!process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(SELF); } catch { return false; }
})();
if (invokedDirectly) {
  const [baseSite, baseArtifactSha256, outRoot, name, fromFile, toFile, file = 'corridor.js'] = process.argv.slice(2);
  if (!baseSite || !baseArtifactSha256 || !outRoot || !name || !fromFile || !toFile) {
    throw new Error('Usage: node make-corridor-mutant.mjs <base-site> <base-artifact-sha256> <out-root> <name> <from-file> <to-file> [file]');
  }
  const made = makeMutant({ baseSite: resolve(baseSite), baseArtifactSha256, outRoot: resolve(outRoot), name,
    edits: [{ file, from: readFileSync(fromFile, 'utf8'), to: readFileSync(toFile, 'utf8') }] });
  console.log(JSON.stringify(made));
}
