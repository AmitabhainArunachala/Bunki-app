#!/usr/bin/env node
/** Refresh Bunki's copy of the Nihongo Study engine from a nihongo-srs checkout, in one command.
 *
 *   node scripts/import-shared-study-engine.mjs --source /path/to/nihongo-srs
 *        [--commit <40 hex>] [--date YYYY-MM-DD] [--content /reviewed/content-directory]
 *   node scripts/import-shared-study-engine.mjs --source /path/to/nihongo-srs --check
 *
 * The checkout must be clean and stand at the commit to adopt: the released Nihongo Study build.
 * The script runs that checkout's own exporter (tools/export_engine.mjs --include-ui) into a
 * scratch folder, checks the result, and only then touches this tree: it replaces
 * prototypes/corridor/vendor/shared-study-engine, rewrites scripts/shared-study-pin.json and
 * scripts/shared-study-release.json, regenerates the engine shape, and runs the checks.
 * Exported files are never edited here. Review the diff before committing it.
 *
 * --commit refuses a checkout that stands anywhere else. --content re-syncs the content binding
 * from a reviewed content directory (scripts/sync-shared-study-content.mjs); without it the
 * release's frozen identity registry must be the one Bunki's content is already bound to.
 * --check writes nothing: it tells whether the copy in this tree is a fresh export of the
 * checkout and whether the checkout stands at the release this tree names.
 *
 * After a refresh: build the site and run the browser verifiers (docs/srs/SHARED_STUDY_ENGINE.md).
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PIN_FORMAT,
  RELEASE_FORMAT,
  SHARED_STUDY_PATHS,
  readRelease,
  sha256,
  verifySharedStudyRelease,
} from './verify-shared-study-release.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXPORTER = 'tools/export_engine.mjs',
  VERIFIER = 'tools/verify_engine.mjs',
  REGISTRY = 'client/contracts/identity-registry.v1.json',
  BOUND_REGISTRY = 'prototypes/corridor/data/shared-study/registry.json',
  BINDING = 'prototypes/corridor/data/shared-study-content.json',
  SHAPE_BUILDER = 'prototypes/corridor/contracts/learner-state/build-engine-shape.mjs',
  SHAPE_TEST = 'prototypes/corridor/contracts/learner-state/learner-state.contract.test.mjs';
const NOTE =
  'Names the Nihongo Study release that the engine copy in this tree must equal. It stands in ' +
  'for the release pointer the Nihongo Study side will publish; when that pointer exists, this ' +
  'file is taken from it.';
const USAGE =
  'Usage: --source <nihongo-srs checkout> [--commit <40 hex>] [--date YYYY-MM-DD] ' +
  '[--content <reviewed content directory>] [--check]';

// A git variable inherited from a hook or a rebase would point these commands at another store.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/u.test(key)));
function run(command, args, { cwd = repo, quiet = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(
      `${[command, ...args].join(' ')} failed (${result.status}):\n${result.stderr || result.stdout}`,
    );
  if (!quiet && result.stderr.trim()) console.error(result.stderr.trim());
  return result.stdout;
}
const node = (args, options) => run(process.execPath, args, options);
const lastJsonLine = (text) => JSON.parse(text.trim().split('\n').at(-1));
const today = () => {
  const now = new Date(),
    two = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
};

function parseArguments(list) {
  const options = { check: false };
  const args = [...list];
  while (args.length) {
    const flag = args.shift();
    if (flag === '--check') options.check = true;
    else if (['--source', '--commit', '--date', '--content'].includes(flag) && args.length)
      options[flag.slice(2)] = args.shift();
    else throw Error(USAGE);
  }
  if (!options.source) throw Error(USAGE);
  if (options.commit !== undefined && !/^[a-f0-9]{40}$/u.test(options.commit))
    throw Error('--commit takes a full 40-character commit');
  if (options.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(options.date))
    throw Error('--date takes YYYY-MM-DD');
  if (options.check && (options.date || options.content))
    throw Error('--check writes nothing; --date and --content do not apply');
  return options;
}

/** The checkout: its top folder, its commit, and proof that nothing tracked is changed.
 * Nothing is written there: git is told to take no optional lock, so even its index stays as it is. */
function readSource(path, expectedCommit) {
  const source = realpathSync(resolve(path));
  const git = (args) =>
    run('git', ['--no-optional-locks', '-C', source, ...args], { quiet: true }).trim();
  if (realpathSync(git(['rev-parse', '--show-toplevel'])) !== source)
    throw Error(`${source} is not the top folder of a checkout`);
  if (!existsSync(join(source, EXPORTER)))
    throw Error(`${source} has no ${EXPORTER}; is it nihongo-srs?`);
  const commit = git(['rev-parse', 'HEAD']);
  if (expectedCommit && commit !== expectedCommit)
    throw Error(`The checkout stands at ${commit}, not at ${expectedCommit}`);
  const changed = git(['status', '--porcelain', '--untracked-files=no']);
  if (changed) throw Error(`The checkout has uncommitted changes:\n${changed}`);
  return { source, commit, show: (file) => gitShow(source, commit, file) };
}
function gitShow(source, commit, file) {
  const result = spawnSync(
    'git',
    ['--no-optional-locks', '-C', source, 'show', `${commit}:${file}`],
    {
      env,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return result.status === 0 ? result.stdout : null;
}

/** The checkout's exporter, with the module parser it needs switched on. */
function exporter(source, args) {
  return lastJsonLine(
    node(['--experimental-vm-modules', '--no-warnings', join(source, EXPORTER), ...args], {
      cwd: source,
    }),
  );
}

let touched = false;

function check({ source, commit }) {
  const release = readRelease();
  if (commit !== release.commit)
    throw Error(`The checkout stands at ${commit}; this tree names release ${release.commit}`);
  // The exporter compares every byte of the copy with what it would write from the checkout.
  const exported = exporter(source, [
    '--include-ui',
    '--check',
    '--output',
    SHARED_STUDY_PATHS.vendor,
  ]);
  node([join(repo, 'scripts/verify-shared-study.mjs')]);
  node([join(repo, 'scripts/verify-shared-study-release.mjs')]);
  return { checked: true, freshExportOf: commit, closureSha256: exported.closureSha256 };
}

function refresh({ source, commit, show }, { date = today(), content }) {
  const scratch = mkdtempSync(join(realpathSync(tmpdir()), 'bunki-engine-import-'));
  const staged = join(scratch, 'shared-study-engine');
  try {
    // 1. Export and prove the export, before this tree is touched.
    const exported = exporter(source, ['--include-ui', '--output', staged]);
    if (
      exported.source?.commit !== commit ||
      exported.source.mode !== 'committed' ||
      exported.source.changedFiles?.length !== 0
    )
      throw Error('The exporter did not produce a committed export of the checkout');
    exporter(source, ['--include-ui', '--check', '--output', staged]);
    // The verifier's digest comes from the commit, never from the export it will judge.
    const verifier = show(VERIFIER);
    if (!verifier) throw Error(`${VERIFIER} is not in commit ${commit}`);
    const release = {
      format: RELEASE_FORMAT,
      repository: exported.source.repository,
      commit,
      reducerSha256: exported.reducerSha256,
      closureSha256: exported.closureSha256,
      date,
      note: NOTE,
    };
    verifySharedStudyRelease({ vendor: staged, release });
    if (sha256(readFileSync(join(staged, VERIFIER))) !== sha256(verifier))
      throw Error('The exported verifier differs from the committed one');
    // The content this tree is bound to must be the content the release schedules.
    const registry = show(REGISTRY),
      bound = content ? join(resolve(content), 'registry.json') : join(repo, BOUND_REGISTRY);
    if (!registry || sha256(registry) !== sha256(readFileSync(bound)))
      throw Error(
        `The release's frozen identity registry (${REGISTRY}) is not ${bound}. ` +
          (content
            ? 'That content directory belongs to another release.'
            : 'Pass --content <reviewed content directory> to re-sync the content binding.'),
      );

    // 2. Replace the copy and the records that name it.
    touched = true;
    rmSync(SHARED_STUDY_PATHS.vendor, { recursive: true, force: true });
    cpSync(staged, SHARED_STUDY_PATHS.vendor, { recursive: true });
    if (content) node([join(repo, 'scripts/sync-shared-study-content.mjs'), '--source', content]);
    const previous = JSON.parse(readFileSync(SHARED_STUDY_PATHS.pin, 'utf8'));
    const pin = {
      format: PIN_FORMAT,
      sourceCommit: commit,
      closureSha256: exported.closureSha256,
      contentBindingSha256: content
        ? sha256(readFileSync(join(repo, BINDING)))
        : previous.contentBindingSha256,
      verifierSha256: sha256(verifier),
    };
    writeFileSync(SHARED_STUDY_PATHS.pin, `${JSON.stringify(pin, null, 2)}\n`);
    writeFileSync(SHARED_STUDY_PATHS.release, `${JSON.stringify(release, null, 2)}\n`);
    node([join(repo, SHAPE_BUILDER), '--write']);

    // 3. Check what now stands in the tree, against the checkout and against the records.
    exporter(source, ['--include-ui', '--check', '--output', SHARED_STUDY_PATHS.vendor]);
    node([join(repo, 'scripts/verify-shared-study.mjs')]);
    node([join(repo, 'scripts/verify-shared-study-release.mjs')]);
    node(['--test', join(repo, SHAPE_TEST)]);
    return {
      imported: true,
      commit,
      reducerSha256: exported.reducerSha256,
      closureSha256: exported.closureSha256,
      files: exported.files,
      bytes: exported.bytes,
      date,
      contentResynced: Boolean(content),
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  const source = readSource(options.source, options.commit);
  console.log(JSON.stringify(options.check ? check(source) : refresh(source, options)));
} catch (error) {
  console.error(error.message);
  if (touched)
    console.error(
      'This tree now holds a partial refresh (`git status` lists it). Restore the vendor folder, ' +
        'the two records and the shape file from git before trying again.',
    );
  process.exitCode = 1;
}
