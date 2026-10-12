/** One product release identity, synchronized copies, and monotonic release admission. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const START = '// BEGIN GENERATED RELEASE IDENTITY — npm run release:sync';
const END = '// END GENERATED RELEASE IDENTITY';
const IDENTITY =
  /\/\/ BEGIN GENERATED RELEASE IDENTITY[^\n]*\n[\s\S]*?\/\/ END GENERATED RELEASE IDENTITY/gu;
const json = (root, file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
const save = (root, file, value) =>
  writeFileSync(join(root, file), `${JSON.stringify(value, null, 2)}\n`);

export function parseVersion(version) {
  assert.equal(typeof version, 'string');
  // Product releases deliberately support only numbered alpha/beta/rc channels.
  // The exact Git commit remains separate from the semantic version.
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.([1-9]\d*))?$/u.exec(
    version,
  );
  assert(match, 'Use MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-rc.N (alpha/beta also supported)');
  const numbers = [match[1], match[2], match[3], match[5] || '0'].map(Number);
  assert(numbers.every(Number.isSafeInteger), 'Version components must be safe integers');
  return {
    major: numbers[0],
    minor: numbers[1],
    patch: numbers[2],
    channel: match[4] || 'stable',
    iteration: numbers[3],
  };
}

export function compareVersions(left, right) {
  const a = parseVersion(left),
    b = parseVersion(right);
  for (const key of ['major', 'minor', 'patch'])
    if (a[key] !== b[key]) return Math.sign(a[key] - b[key]);
  const channels = ['alpha', 'beta', 'rc', 'stable'];
  if (a.channel !== b.channel)
    return Math.sign(channels.indexOf(a.channel) - channels.indexOf(b.channel));
  return Math.sign(a.iteration - b.iteration);
}

export function validateRelease(release) {
  assert.deepEqual(
    Object.keys(release).sort(),
    [
      'schemaVersion',
      'product',
      'version',
      'channel',
      'releasedOn',
      'learnerDataEpoch',
      'migration',
      'rollbackCompatible',
      'notes',
    ].sort(),
    'Unexpected or missing release fields',
  );
  assert.equal(release.schemaVersion, 1);
  assert.equal(release.product, 'KAIRO');
  const version = parseVersion(release.version);
  assert.equal(release.channel, version.channel, 'Channel must agree with semantic version');
  assert.match(release.releasedOn, /^\d{4}-\d{2}-\d{2}$/u);
  assert.equal(
    new Date(`${release.releasedOn}T00:00:00Z`).toISOString().slice(0, 10),
    release.releasedOn,
    'Invalid release date',
  );
  assert(Number.isSafeInteger(release.learnerDataEpoch) && release.learnerDataEpoch >= 1);
  assert.equal(typeof release.rollbackCompatible, 'boolean');
  assert.equal(typeof release.migration, 'string');
  assert(
    release.migration === 'none' ||
      /^docs\/migrations\/[a-z0-9][a-z0-9-]*\.md$/u.test(release.migration),
    'Migration must name a reviewed repository plan',
  );
  assert.equal(
    release.notes,
    `releases/${release.version}.md`,
    'Release notes must belong to this exact version',
  );
  return release;
}

export function assertTransition(previous, next) {
  validateRelease(next);
  if (!previous) {
    assert.equal(next.version, '1.0.0', 'The first numbered baseline is 1.0.0');
    assert.equal(next.learnerDataEpoch, 1);
    assert.equal(next.migration, 'none');
    assert.equal(next.rollbackCompatible, true);
    return;
  }
  validateRelease(previous);
  assert(
    compareVersions(next.version, previous.version) > 0,
    'Every production PR needs a new, increasing release version',
  );
  assert(next.releasedOn >= previous.releasedOn, 'Release date cannot go backwards');
  assert(
    next.learnerDataEpoch >= previous.learnerDataEpoch,
    'Learner-data epoch cannot go backwards',
  );
  if (next.learnerDataEpoch !== previous.learnerDataEpoch) {
    assert.notEqual(
      next.migration,
      'none',
      'Data epoch changes require a migration and recovery plan',
    );
  }
  if (!next.rollbackCompatible) {
    assert.notEqual(next.migration, 'none', 'Incompatible data changes require a migration plan');
    assert(
      parseVersion(next.version).major > parseVersion(previous.version).major,
      'Incompatible learner-data changes require a major release',
    );
  }
}

export function runtimeRelease(release) {
  validateRelease(release);
  return {
    version: release.version,
    channel: release.channel,
    releasedOn: release.releasedOn,
    learnerDataEpoch: release.learnerDataEpoch,
  };
}

export function releaseBlock(release) {
  return `${START}\nconst APP_RELEASE = Object.freeze(${JSON.stringify(runtimeRelease(release))});\n${END}`;
}

export function syncRelease(root = ROOT) {
  const release = validateRelease(json(root, 'release.json'));
  const file = join(root, 'prototypes/corridor/corridor.js');
  const source = readFileSync(file, 'utf8');
  assert.equal(
    [...source.matchAll(IDENTITY)].length,
    1,
    'Expected exactly one generated release identity',
  );
  const pkg = json(root, 'package.json'),
    lock = json(root, 'package-lock.json');
  pkg.version = release.version;
  lock.version = release.version;
  lock.packages[''].version = release.version;
  save(root, 'package.json', pkg);
  save(root, 'package-lock.json', lock);
  writeFileSync(file, source.replace(IDENTITY, releaseBlock(release)));
  return release;
}

export function verifyRelease(root = ROOT, { stable = false } = {}) {
  const release = validateRelease(json(root, 'release.json'));
  if (stable)
    assert.equal(
      release.channel,
      'stable',
      'The phone production origin accepts stable releases only',
    );
  const pkg = json(root, 'package.json'),
    lock = json(root, 'package-lock.json');
  assert.equal(pkg.version, release.version, 'Run npm run release:sync');
  assert.equal(lock.version, release.version, 'Run npm run release:sync');
  assert.equal(lock.packages[''].version, release.version, 'Run npm run release:sync');
  const source = readFileSync(join(root, 'prototypes/corridor/corridor.js'), 'utf8');
  const blocks = [...source.matchAll(IDENTITY)];
  assert.equal(blocks.length, 1, 'Expected exactly one installed release identity');
  assert.equal(
    blocks[0][0],
    releaseBlock(release),
    'Installed version drifted; run npm run release:sync',
  );
  const notes = readFileSync(join(root, release.notes), 'utf8');
  assert(
    notes.startsWith(`# Bunki / KAIRO ${release.version}\n`),
    'Release notes must name the exact version',
  );
  for (const section of ['Changes', 'Data and compatibility', 'Verification'])
    assert(notes.includes(`## ${section}\n`), `Release notes need ${section}`);
  assert(
    !/\bTODO\b|FILL_THIS_IN/u.test(notes),
    'Complete release notes before requesting production admission',
  );
  if (release.migration !== 'none') {
    const migration = readFileSync(join(root, release.migration), 'utf8');
    for (const heading of ['Upgrade', 'Recovery', 'Verification'])
      assert(migration.includes(`## ${heading}\n`), `Migration plan needs ${heading}`);
    assert(!/\bTODO\b|FILL_THIS_IN/u.test(migration), 'Complete the migration plan');
  }
  const pin = json(root, 'prototypes/corridor/data/fsrs-pin.json');
  return {
    ...release,
    scheduler: {
      algorithm: pin.algorithm,
      package: pin.package,
      version: pin.pinnedVersion,
      parameterSetId: pin.parameterSetId,
    },
  };
}

export function verifyBase(base, root = ROOT) {
  assert.match(base, /^[a-f0-9]{40}$/u, 'Base must be an exact commit SHA');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const files = git('ls-tree', '-r', '--name-only', base, '--', 'release.json', 'releases').split(
    '\n',
  );
  const previous = files.includes('release.json')
    ? JSON.parse(git('show', `${base}:release.json`))
    : null;
  const next = json(root, 'release.json');
  assertTransition(previous, next);
  // A newer release adds history; it may not silently rewrite past release notes.
  for (const file of files.filter((path) =>
    /^releases\/\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.[1-9]\d*)?\.md$/u.test(path),
  )) {
    assert.equal(
      readFileSync(join(root, file), 'utf8').trim(),
      git('show', `${base}:${file}`),
      `Published history changed: ${file}`,
    );
  }
}

export function prepare(version, root = ROOT) {
  const current = json(root, 'release.json');
  const parsed = parseVersion(version);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const next = {
    ...current,
    version,
    channel: parsed.channel,
    releasedOn: date,
    migration: 'none',
    rollbackCompatible: true,
    notes: `releases/${version}.md`,
  };
  assertTransition(current, next);
  assert(
    !existsSync(join(root, next.notes)),
    'Release notes already exist; never reuse a release number',
  );
  const file = `# Bunki / KAIRO ${version}\n\nPlanned release date: ${date} (Asia/Tokyo). Publication is established by the GitHub Release and live build identity.\n\n## Changes\n\nFILL_THIS_IN: Describe the user-visible change and its purpose.\n\n## Data and compatibility\n\nFILL_THIS_IN: State learner-data, card-ID, FSRS, backup and rollback impact.\n\n## Verification\n\nFILL_THIS_IN: State the relevant checks and any known limitations. The publisher attaches the full CI receipt and live identity after admission.\n`;
  mkdirSync(join(root, 'releases'), { recursive: true });
  save(root, 'release.json', next);
  writeFileSync(join(root, next.notes), file);
  syncRelease(root);
  console.log(`Prepared ${version}; complete ${next.notes} before opening the release PR.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'sync' && args.length === 0) console.log(JSON.stringify(syncRelease()));
    else if (command === 'prepare' && args.length === 1) prepare(args[0]);
    else if (command === 'verify' && args.length === 0) {
      const release = verifyRelease(ROOT, {
        stable:
          process.env.GITHUB_REF === 'refs/heads/main' || process.env.GITHUB_BASE_REF === 'main',
      });
      if (process.env.BUNKI_RELEASE_BASE) verifyBase(process.env.BUNKI_RELEASE_BASE);
      console.log(
        JSON.stringify({
          version: release.version,
          channel: release.channel,
          learnerDataEpoch: release.learnerDataEpoch,
          valid: true,
        }),
      );
    } else throw new Error('Usage: version.mjs verify|sync|prepare <version>');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
