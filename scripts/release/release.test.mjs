import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { URL } from 'node:url';
import { parse } from 'yaml';
import {
  assertTransition,
  compareVersions,
  parseVersion,
  prepare,
  releaseBlock,
  runtimeRelease,
  syncRelease,
  validateRelease,
  verifyRelease,
  verifyBase,
} from './version.mjs';
import { assertAssetMatch, assertEvidence, assertExistingRecord, REPOSITORY } from './publish.mjs';

const baseline = () => ({
  schemaVersion: 1,
  product: 'KAIRO',
  version: '1.0.0',
  channel: 'stable',
  releasedOn: '2026-10-12',
  learnerDataEpoch: 1,
  migration: 'none',
  rollbackCompatible: true,
  notes: 'releases/1.0.0.md',
});
const next = (version = '1.0.1') => ({
  ...baseline(),
  version,
  channel: parseVersion(version).channel,
  notes: `releases/${version}.md`,
});

test('orders numbered prereleases, promotions and numeric version components', () => {
  const versions = [
    '1.0.0-alpha.1',
    '1.0.0-beta.1',
    '1.0.0-rc.1',
    '1.0.0-rc.2',
    '1.0.0',
    '1.0.1',
    '1.9.0',
    '1.10.0',
    '2.0.0',
  ];
  for (let i = 1; i < versions.length; i++)
    assert(compareVersions(versions[i], versions[i - 1]) > 0);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
});
for (const version of [
  'v1.0.0',
  '01.0.0',
  '1.0',
  '1.0.0-rc.0',
  '1.0.0-rc.01',
  '1.0.0+latest',
  '1.0.0\n',
  '99999999999999999.0.0',
]) {
  test(`rejects ambiguous or unsupported version ${JSON.stringify(version)}`, () =>
    assert.throws(() => parseVersion(version)));
}
test('admits the documented bootstrap and normal patch/minor/major releases', () => {
  assertTransition(null, baseline());
  for (const version of ['1.0.1', '1.1.0', '2.0.0']) assertTransition(baseline(), next(version));
  assertTransition(next('1.1.0-rc.1'), next('1.1.0'));
});
test('refuses duplicate and backwards version numbers', () => {
  for (const version of ['1.0.0', '0.9.0', '1.0.0-rc.1'])
    assert.throws(() => assertTransition(baseline(), next(version)));
});
test('requires migration evidence and a major number for incompatible data changes', () => {
  assert.throws(() => assertTransition(baseline(), { ...next(), learnerDataEpoch: 2 }));
  assert.throws(() =>
    assertTransition(baseline(), {
      ...next(),
      migration: 'docs/migrations/new-record.md',
      rollbackCompatible: false,
    }),
  );
  assertTransition(baseline(), {
    ...next('2.0.0'),
    learnerDataEpoch: 2,
    migration: 'docs/migrations/new-record.md',
    rollbackCompatible: false,
  });
  assert.throws(() => assertTransition({ ...baseline(), learnerDataEpoch: 2 }, next('2.0.0')));
});
for (const patch of [
  { channel: 'rc' },
  { releasedOn: '2026-02-30' },
  { learnerDataEpoch: 0 },
  { notes: '../../secrets' },
  { migration: 'docs/migrations/../escape.md' },
  { unexpected: true },
])
  test(`rejects invalid release metadata ${JSON.stringify(patch)}`, () =>
    assert.throws(() => validateRelease({ ...baseline(), ...patch })));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bunki-release-test-'));
  for (const path of ['releases', 'prototypes/corridor/data'])
    mkdirSync(join(root, path), { recursive: true });
  const save = (path, value) => writeFileSync(join(root, path), JSON.stringify(value));
  save('release.json', baseline());
  save('package.json', { version: '1.0.0' });
  save('package-lock.json', { version: '1.0.0', packages: { '': { version: '1.0.0' } } });
  save('prototypes/corridor/data/fsrs-pin.json', {
    algorithm: 'FSRS-6',
    package: 'ts-fsrs',
    pinnedVersion: '5.4.1',
    parameterSetId: 'pinned',
  });
  writeFileSync(join(root, 'prototypes/corridor/corridor.js'), `${releaseBlock(baseline())}\n`);
  writeFileSync(
    join(root, 'releases/1.0.0.md'),
    '# Bunki / KAIRO 1.0.0\n\n## Changes\n\nIdentity.\n\n## Data and compatibility\n\nNo migration.\n\n## Verification\n\nFull battery.\n',
  );
  return { root, save, close: () => rmSync(root, { recursive: true, force: true }) };
}
test('detects installed-version drift and synchronizes every owned copy', () => {
  const f = fixture();
  try {
    verifyRelease(f.root);
    f.save('package.json', { version: '0.0.0' });
    assert.throws(() => verifyRelease(f.root));
    syncRelease(f.root);
    verifyRelease(f.root);
    writeFileSync(join(f.root, 'prototypes/corridor/corridor.js'), releaseBlock(next()));
    assert.throws(() => verifyRelease(f.root));
    syncRelease(f.root);
    verifyRelease(f.root);
    assert.deepEqual(runtimeRelease(baseline()), {
      version: '1.0.0',
      channel: 'stable',
      releasedOn: '2026-10-12',
      learnerDataEpoch: 1,
    });
  } finally {
    f.close();
  }
});
test('rejects unfinished notes and duplicate generated identities', () => {
  const f = fixture();
  try {
    writeFileSync(
      join(f.root, 'releases/1.0.0.md'),
      '# Bunki / KAIRO 1.0.0\n\n## Changes\n\nTODO\n\n## Data and compatibility\n\n## Verification\n',
    );
    assert.throws(() => verifyRelease(f.root));
    writeFileSync(
      join(f.root, 'prototypes/corridor/corridor.js'),
      `${releaseBlock(baseline())}\n${releaseBlock(baseline())}`,
    );
    assert.throws(() => syncRelease(f.root));
  } finally {
    f.close();
  }
});

test('real Git comparison admits a new release and refuses rewritten release history', () => {
  const f = fixture();
  const git = (...args) => execFileSync('git', args, { cwd: f.root, encoding: 'utf8' }).trim();
  try {
    git('init', '-q');
    git('add', '.');
    git(
      '-c',
      'user.name=Release test',
      '-c',
      'user.email=release-test@example.invalid',
      'commit',
      '-qm',
      'First release',
    );
    const base = git('rev-parse', 'HEAD');
    assert.throws(() => verifyBase(base, f.root));
    f.save('release.json', next());
    verifyBase(base, f.root);
    writeFileSync(join(f.root, 'releases/1.0.0.md'), 'Changed historical notes');
    assert.throws(() => verifyBase(base, f.root));
  } finally {
    f.close();
  }
});

test('the preparation command advances synchronized identities and requires completed notes', () => {
  const f = fixture();
  try {
    prepare('1.1.0-rc.1', f.root);
    assert.throws(() => verifyRelease(f.root));
    writeFileSync(
      join(f.root, 'releases/1.1.0-rc.1.md'),
      '# Bunki / KAIRO 1.1.0-rc.1\n\n## Changes\n\nCandidate.\n\n## Data and compatibility\n\nNo migration.\n\n## Verification\n\nFull battery.\n',
    );
    assert.equal(verifyRelease(f.root).channel, 'rc');
    assert.throws(() => verifyRelease(f.root, { stable: true }));
  } finally {
    f.close();
  }
});

const proof = () => {
  const release = { ...baseline(), scheduler: { version: '5.4.1' } };
  const producer = 'a'.repeat(40),
    tree = 'b'.repeat(40),
    digest = 'c'.repeat(64);
  const manifest = {
    release,
    sourceDirty: false,
    buildId: '1.0.0+git.aaaaaaaaaaaa',
    gitSha: producer,
    artifactSha256: digest,
  };
  const receipt = {
    kind: 'bunki-full-battery',
    scope: 'full',
    status: 'passed',
    identity: { repository: REPOSITORY, tree, sha: producer, policyDigest: digest },
    artifact: { producerSha: producer, artifactSha256: digest, manifestSha256: digest },
    requiredNames: ['storage', 'offline'],
    gates: [
      { name: 'storage', status: 'passed' },
      { name: 'offline', status: 'flaky' },
    ],
  };
  return {
    release,
    manifest,
    manifestSha256: digest,
    receipt,
    tree,
    producerTree: tree,
    policyDigest: digest,
    requiredNames: ['storage', 'offline'],
  };
};
test('accepts exact full evidence, including an explicitly recorded permitted retry', () =>
  assertEvidence(proof()));
for (const [name, change] of Object.entries({
  'docs-only proof': (f) => {
    f.receipt.scope = 'docs';
  },
  'another source tree': (f) => {
    f.producerTree = 'd'.repeat(40);
  },
  'another artifact': (f) => {
    f.manifest.artifactSha256 = 'd'.repeat(64);
  },
  'changed policy': (f) => {
    f.policyDigest = 'd'.repeat(64);
  },
  'missing gate': (f) => {
    f.receipt.gates.pop();
  },
  'failed gate': (f) => {
    f.receipt.gates[0].status = 'failed';
  },
  'dirty package': (f) => {
    f.manifest.sourceDirty = true;
  },
  'wrong producer': (f) => {
    f.receipt.artifact.producerSha = 'd'.repeat(40);
  },
}))
  test(`publication rejects ${name}`, () => {
    const f = proof();
    change(f);
    assert.throws(() => assertEvidence(f));
  });
test('a released version cannot be moved or silently rebuilt', () => {
  const identity = {
    version: '1.0.0',
    releaseCommit: 'a'.repeat(40),
    manifestSha256: 'b'.repeat(64),
    artifactSha256: 'c'.repeat(64),
  };
  const record = { schemaVersion: 1, tag: 'v1.0.0', ...identity };
  assertExistingRecord(record, identity);
  for (const key of ['releaseCommit', 'manifestSha256', 'artifactSha256'])
    assert.throws(() =>
      assertExistingRecord(record, { ...identity, [key]: 'd'.repeat(identity[key].length) }),
    );
});
test('interrupted uploads resume only when retained assets match byte for byte', () => {
  const bytes = Buffer.from('retained package');
  const remote = {
    state: 'uploaded',
    size: bytes.length,
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  };
  assertAssetMatch(remote, bytes);
  assert.throws(() => assertAssetMatch(remote, Buffer.from('modified package')));
  assert.throws(() => assertAssetMatch({ ...remote, state: 'starter' }, bytes));
});
test('release publishing has write authority only after successful main deployment, with guards on both artifact routes', () => {
  const workflow = parse(
    readFileSync(new URL('../../.github/workflows/pages-app.yml', import.meta.url), 'utf8'),
  );
  const job = workflow.jobs.release;
  assert.deepEqual(job.needs, ['lookup', 'deploy']);
  assert.equal(
    job.if,
    "always() && github.ref == 'refs/heads/main' && needs.deploy.result == 'success'",
  );
  assert.deepEqual(job.permissions, { contents: 'write', actions: 'read' });
  assert.equal(workflow.permissions.contents, 'read');
  for (const name of ['lookup', 'package'])
    assert(
      workflow.jobs[name].steps.some((step) =>
        /scripts\/release\/publish.mjs guard/u.test(step.run || ''),
      ),
    );
  assert(job.steps.some((step) => /scripts\/release\/publish.mjs publish/u.test(step.run || '')));
});
