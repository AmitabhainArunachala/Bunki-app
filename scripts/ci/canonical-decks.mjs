/** Canonical content integrity pin, independent of the engine/UI pin.
 * The source repository is private: CI needs an approved, externally provisioned
 * BUNKI_CANONICAL_SOURCE directory. Anonymous downloading fails closed and does
 * not establish access. See CANONICAL_DECKS.md for the source and fixture contract.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkout = realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
const pin = JSON.parse(readFileSync(new URL('./canonical-decks-source.json', import.meta.url)));
const packs = ['n2', 'n1', 'senmon', 'kotoba-master'];

function inside(root, directory) {
  const path = relative(root, directory);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

// Resolve parent aliases (including macOS /tmp); reject links observed during validation.
// The build environment owns this cache; this is not isolation from concurrent writers.
function externalDirectory(directory, root = checkout) {
  const path = resolve(directory);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  assert(!stat?.isSymbolicLink(), `Symlink directory refused: ${path}`);
  assert(!stat || stat.isDirectory(), `Not a directory: ${path}`);
  const normalized = stat
    ? realpathSync(path)
    : join(externalDirectory(dirname(path), root), basename(path));
  assert(
    !inside(root, normalized) && !inside(checkout, normalized),
    `Path inside Bunki checkout: ${path}`,
  );
  return normalized;
}

function regularFile(directory, path) {
  let current = directory;
  for (const part of path.split('/')) {
    current = join(current, part);
    assert(!lstatSync(current).isSymbolicLink(), `Symlink file refused: ${current}`);
  }
  assert(lstatSync(current).isFile(), `Not a regular file: ${current}`);
  return readFileSync(current);
}

function verifyBytes(file, bytes) {
  assert.equal(bytes.length, file.bytes, `Pinned byte size mismatch: ${file.path}`);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    file.sha256,
    `Pinned hash mismatch: ${file.path}`,
  );
}

export function verifyCanonicalSource(directory) {
  const source = externalDirectory(directory);
  for (const file of pin.files) verifyBytes(file, regularFile(source, file.path));
  return source;
}

export function verifyCanonicalDeckOutput(bunkiRoot, outputDirectory) {
  const root = realpathSync(resolve(bunkiRoot));
  const output = externalDirectory(outputDirectory, root);
  for (const pack of packs) {
    for (const name of ['deck.json', 'tokens.json']) {
      const path = `${pack}/${name}`;
      assert(
        regularFile(output, path).equals(
          regularFile(join(root, 'prototypes/corridor/decks'), path),
        ),
        `Canonical deck byte parity mismatch: ${path}`,
      );
    }
  }
}

function cachedSource(root, temporaryRoot) {
  const cacheRoot = externalDirectory(join(temporaryRoot, 'bunki-canonical-content'), root);
  const cache = externalDirectory(join(cacheRoot, pin.source), root);
  if (!lstatSync(cache, { throwIfNoEntry: false })) {
    // Check all downloads before storing any source; never repair an existing cache.
    const files = pin.files.map((file) => {
      const bytes = execFileSync(
        'curl',
        [
          '--disable',
          '--fail',
          '--silent',
          '--show-error',
          '--proto',
          '=https',
          '--connect-timeout',
          '15',
          '--max-time',
          '120',
          '--max-filesize',
          String(file.bytes),
          `https://raw.githubusercontent.com/AIKAGRYA/nihongo-srs/${pin.source}/${file.path}`,
        ],
        { timeout: 125000, maxBuffer: file.bytes + 1024 },
      );
      verifyBytes(file, bytes);
      return [file.path, bytes];
    });
    mkdirSync(cacheRoot, { recursive: true });
    mkdirSync(cache);
    for (const [path, bytes] of files) {
      mkdirSync(dirname(join(cache, path)), { recursive: true });
      writeFileSync(join(cache, path), bytes, { flag: 'wx' });
    }
  }
  return verifyCanonicalSource(cache);
}

// The private producer's streams are diagnostic-only: buffer them within a
// fixed bound and discard them, never inheriting or exposing raw child output.
const producerOutputLimit = 1024 * 1024;
const spawnCodes = new Set([
  'EACCES',
  'EAGAIN',
  'EMFILE',
  'ENFILE',
  'ENOENT',
  'EPERM',
  'ETIMEDOUT',
]);

function producerFailure(error) {
  const status = Number.isInteger(error?.status) ? error.status : undefined;
  const signal =
    typeof error?.signal === 'string' && /^SIG[A-Z0-9]+$/.test(error.signal)
      ? error.signal
      : undefined;
  const code =
    error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || spawnCodes.has(error?.code)
      ? error.code
      : undefined;
  const reason = [
    status === undefined ? undefined : `exit status ${status}`,
    signal === undefined ? undefined : `signal ${signal}`,
    code === undefined ? undefined : `spawn code ${code}`,
  ]
    .filter(Boolean)
    .join(', ');
  return new Error(
    `Canonical producer failed (tools/build_bunki.py @ ${pin.source}): ` +
      (reason || 'unknown failure'),
  );
}

export function buildCanonicalFrozenDecks(
  bunkiRoot,
  { sourceDirectory, python, outputDirectory } = {},
) {
  const root = realpathSync(resolve(bunkiRoot));
  const temporaryRoot = externalDirectory(process.env.RUNNER_TEMP || realpathSync(tmpdir()), root);
  const suppliedOutput = outputDirectory !== undefined;
  let output;
  if (suppliedOutput) {
    output = externalDirectory(outputDirectory, root);
    assert(
      !lstatSync(output, { throwIfNoEntry: false }),
      `Output directory already exists: ${output}`,
    );
  }
  const source = sourceDirectory || process.env.BUNKI_CANONICAL_SOURCE;
  const verifiedSource = source
    ? verifyCanonicalSource(externalDirectory(source, root))
    : cachedSource(root, temporaryRoot);
  if (suppliedOutput) mkdirSync(output);
  else output = mkdtempSync(join(temporaryRoot, 'bunki-canonical-output-'));
  try {
    try {
      execFileSync(
        python || process.env.BUNKI_CANONICAL_PYTHON || 'python3',
        [join(verifiedSource, 'tools/build_bunki.py'), root, output],
        {
          cwd: verifiedSource,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: producerOutputLimit,
          timeout: 300000,
          env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
        },
      );
    } catch (error) {
      throw producerFailure(error);
    }
    verifyCanonicalDeckOutput(root, output);
  } finally {
    if (!suppliedOutput) rmSync(output, { recursive: true, force: true });
  }
}
