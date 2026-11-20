#!/usr/bin/env node
/** Bunki's engine copy must be the Nihongo Study release that Bunki names.
 *
 * scripts/shared-study-release.json names one release of the Nihongo Study engine: its source
 * commit, its reducer digest and the closure digest of its distribution. This check fails when
 * the copy under prototypes/corridor/vendor/shared-study-engine is anything else: exported from
 * another commit, changed by one byte, or holding a file the release does not have (or lacking
 * one it has).
 *
 * Every digest is recomputed here from the bytes on disk. Nothing from the copy is imported or
 * run, and no digest the copy states about itself is taken on trust.
 * scripts/verify-shared-study.mjs stays the check of the reviewed pin and the content binding;
 * this one ties the copy, and that pin, to the named release.
 *
 *   node scripts/verify-shared-study-release.mjs [--vendor <dir>] [--release <file>] [--pin <file>]
 */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(import.meta.url),
  repo = resolve(dirname(HERE), '..');
export const RELEASE_FORMAT = 'bunki-shared-study-release/v1';
export const PIN_FORMAT = 'bunki-shared-study-pin/v1';
export const SHARED_STUDY_PATHS = Object.freeze({
  vendor: resolve(repo, 'prototypes/corridor/vendor/shared-study-engine'),
  release: resolve(repo, 'scripts/shared-study-release.json'),
  pin: resolve(repo, 'scripts/shared-study-pin.json'),
});
const MANIFEST = 'engine-manifest.json',
  REDUCER = 'client/replay.mjs';
const COMMIT = /^[a-f0-9]{40}$/u,
  DIGEST = /^[a-f0-9]{64}$/u,
  DAY = /^\d{4}-\d{2}-\d{2}$/u;

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const fail = (message) => {
  throw Error(`Shared study engine copy is not the named Nihongo Study release: ${message}`);
};
const sortKeys = (value) =>
  Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort(compare)
            .map((key) => [key, sortKeys(value[key])]),
        )
      : value;

/** The closure digest of a distribution manifest: every field but the digest itself, keys sorted. */
export function closureOf(manifest) {
  const signed = { ...manifest };
  delete signed.closureSha256;
  return sha256(JSON.stringify(sortKeys(signed)));
}

/** Every file under a folder, as sorted relative paths. Links and special files are refused. */
export function inventory(root, path = root) {
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => {
      const full = resolve(path, entry.name);
      if (entry.isSymbolicLink()) fail(`${relative(root, full)} is a link`);
      if (entry.isDirectory()) return inventory(root, full);
      if (!entry.isFile()) fail(`${relative(root, full)} is not a plain file`);
      return [relative(root, full).replaceAll('\\', '/')];
    })
    .sort(compare);
}

/** The release record, with every field it must carry. */
export function readRelease(path = SHARED_STUDY_PATHS.release) {
  const release = JSON.parse(readFileSync(path, 'utf8'));
  if (
    release?.format !== RELEASE_FORMAT ||
    typeof release.repository !== 'string' ||
    !release.repository ||
    !COMMIT.test(release.commit ?? '') ||
    !DIGEST.test(release.reducerSha256 ?? '') ||
    !DIGEST.test(release.closureSha256 ?? '') ||
    !DAY.test(release.date ?? '') ||
    typeof release.note !== 'string' ||
    !release.note
  )
    fail('the release record is incomplete');
  return release;
}

/** Compare a copy with a release record (and, when given, the reviewed pin with the same record). */
export function verifySharedStudyRelease({
  vendor = SHARED_STUDY_PATHS.vendor,
  release = readRelease(),
  pin = null,
} = {}) {
  if (pin !== null) {
    if (pin?.format !== PIN_FORMAT) fail('the reviewed pin has an unknown format');
    if (pin.sourceCommit !== release.commit)
      fail(`the reviewed pin names commit ${pin.sourceCommit}, the release is ${release.commit}`);
    if (pin.closureSha256 !== release.closureSha256)
      fail(
        `the reviewed pin names closure ${pin.closureSha256}, the release is ${release.closureSha256}`,
      );
  }
  const root = resolve(vendor);
  if (!lstatSync(root, { throwIfNoEntry: false })?.isDirectory())
    fail('the copy is not a plain folder');
  const manifest = JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8'));
  const source = manifest?.source ?? {};
  if (source.repository !== release.repository)
    fail(`it comes from ${source.repository}, the release is in ${release.repository}`);
  if (source.commit !== release.commit)
    fail(`it was exported from commit ${source.commit}, the release is ${release.commit}`);
  if (
    source.mode !== 'committed' ||
    !Array.isArray(source.changedFiles) ||
    source.changedFiles.length !== 0
  )
    fail('it was exported from uncommitted source');
  if (!Array.isArray(manifest.files)) fail('its manifest lists no files');

  // The file closure: exactly the release's files, each with the release's bytes.
  const listed = new Map();
  for (const record of manifest.files) {
    if (typeof record?.path !== 'string' || record.path === MANIFEST || listed.has(record.path))
      fail('its manifest holds an invalid file record');
    listed.set(record.path, record);
  }
  const present = inventory(root),
    onDisk = new Set(present);
  const added = present.filter((path) => path !== MANIFEST && !listed.has(path)),
    missing = [...listed.keys(), MANIFEST].filter((path) => !onDisk.has(path));
  if (added.length || missing.length)
    fail(
      [
        added.length ? `not in the release: ${added.join(', ')}` : '',
        missing.length ? `missing from the copy: ${missing.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; '),
    );
  for (const [path, record] of listed) {
    const bytes = readFileSync(resolve(root, path));
    if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256)
      fail(`${path} does not have the release's bytes`);
  }
  const closure = closureOf(manifest);
  if (closure !== release.closureSha256 || manifest.closureSha256 !== release.closureSha256)
    fail(`its closure is ${closure}, the release is ${release.closureSha256}`);
  const reducer = sha256(readFileSync(resolve(root, REDUCER)));
  if (reducer !== release.reducerSha256 || manifest.reducerSha256 !== release.reducerSha256)
    fail(`its reducer is ${reducer}, the release is ${release.reducerSha256}`);
  return {
    repository: release.repository,
    commit: release.commit,
    reducerSha256: reducer,
    closureSha256: closure,
    files: listed.size,
    named: release.date,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === HERE) {
  try {
    const args = process.argv.slice(2),
      paths = { ...SHARED_STUDY_PATHS };
    while (args.length) {
      const flag = args.shift(),
        name = { '--vendor': 'vendor', '--release': 'release', '--pin': 'pin' }[flag],
        value = args.shift();
      if (!name || !value) throw Error('Usage: [--vendor <dir>] [--release <file>] [--pin <file>]');
      paths[name] = resolve(value);
    }
    const result = verifySharedStudyRelease({
      vendor: paths.vendor,
      release: readRelease(paths.release),
      pin: JSON.parse(readFileSync(paths.pin, 'utf8')),
    });
    console.log(JSON.stringify({ engineCopyIsNamedRelease: true, ...result }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
