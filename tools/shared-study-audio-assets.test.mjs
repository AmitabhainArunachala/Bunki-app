/** Asset admission and authenticated QA derivation, using tiny synthetic sites. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORRIDOR_REQUIRED_ROOTS, corridorAssetFiles } from '../scripts/corridor-assets.mjs';
import { verifyBundledArtifact } from '../prototypes/bunki-desktop/lib/artifact.cjs';
const { test } = await import(
  process.env.VITEST === 'true' && !process.env.NODE_TEST_CONTEXT ? 'vitest' : 'node:test'
);
const helper = 'shared-study-audio-preparation.mjs';
const source = fileURLToPath(new URL('../prototypes/corridor/', import.meta.url));
const builder = fileURLToPath(new URL('../scripts/build-shared-study-qa.mjs', import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const routes = [
  'index.html',
  'corridor.js',
  'modules/study-host.mjs',
  'decks/player/mount.js',
  'shared-study-content.mjs',
  'shared-study-storage.mjs',
  'decks/player/shared-frame.mjs',
  'decks/player/shared-mount.mjs',
  helper,
];
function put(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}
function scope() {
  const parent = process.env.BUNKI_AUDIO_ASSET_TEST_ROOT || join(homedir(), '.dharma');
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(join(parent, 'audio-assets-'));
}
function assets(root) {
  const dirs = new Set(['fonts', 'modules', 'guided', 'kanji-world', 'data', 'vendor', 'design']);
  for (const path of CORRIDOR_REQUIRED_ROOTS) {
    if (dirs.has(path)) {
      mkdirSync(join(root, path), { recursive: true });
      put(join(root, path, 'fixture.txt'), 'public fixture');
    } else put(join(root, path), 'public fixture');
  }
  put(join(root, helper), readFileSync(join(source, helper)));
  put(join(root, 'learner-private.mjs'), 'not a public runtime asset');
}
function inventory(root, directory = root) {
  return readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const path = join(directory, name);
      return lstatSync(path).isDirectory()
        ? inventory(root, path)
        : [relative(root, path).split('\\').join('/')];
    });
}
function seal(site) {
  const files = inventory(site)
    .filter((path) => path !== 'build-identity.json')
    .map((path) => {
      const bytes = readFileSync(join(site, path));
      return { path, bytes: bytes.length, sha256: sha(bytes) };
    });
  const sourceAssetSha256 = sha('synthetic source fixture');
  const manifest = {
    schemaVersion: 1,
    product: 'KAIRO',
    gitSha: 'a'.repeat(40),
    sourceDirty: true,
    sourceAssetSha256,
    artifactSha256: sha(JSON.stringify(files)),
    files,
  };
  put(join(site, 'build-identity.json'), JSON.stringify(manifest));
  return manifest;
}
function siteFixture(root, variant = 'current') {
  const site = join(root, 'site');
  mkdirSync(site);
  for (const path of routes) put(join(site, path), readFileSync(join(source, path)));
  // This is a portable authenticated fixture, not a second production build.
  put(join(site, 'corridor.js'), 'export const syntheticAssetFixture = true;\n');
  put(
    join(site, 'sw.js'),
    `self.KAIRO_ASSET_VERSION = ${JSON.stringify(sha('synthetic source fixture'))};\n`,
  );
  put(join(site, 'manifest.webmanifest'), '{}');
  if (variant === 'missing') unlinkSync(join(site, helper));
  if (variant === 'changed')
    put(
      join(site, helper),
      Buffer.concat([
        readFileSync(join(site, helper)),
        Buffer.from('\n// changed admitted helper\n'),
      ]),
    );
  seal(site);
  verifyBundledArtifact(site);
  return site;
}
function derive(root, site, name = 'qa') {
  const output = join(root, name);
  let env = process.env;
  // The product's native clone remains real on macOS. Other CI platforms use
  // a narrow copy-command port, exercising the actual builder and verifier.
  if (process.platform !== 'darwin') {
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(bin, 'cp'),
      `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);if(args.length!==4||args[0]!=='-c'||args[1]!=='-R')process.exit(23);fs.cpSync(args[2],args[3],{recursive:true,errorOnExist:true,force:false});\n`,
      { mode: 0o700 },
    );
    env = { ...process.env, PATH: bin + ':' + process.env.PATH };
  }
  const result = spawnSync(
    process.execPath,
    [builder, '--site', site, '--out', output, '--run', 'audio-assets-fixture'],
    { encoding: 'utf8', timeout: 10000, env },
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return { result, output };
}

test('actual asset consumer admits the helper and excludes unrelated private files', () => {
  const root = scope();
  try {
    assets(root);
    const paths = corridorAssetFiles(root).map((path) => relative(root, path));
    assert(paths.includes(helper));
    assert(!paths.includes('learner-private.mjs'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('the helper is required rather than an optional asset', () => {
  const root = scope();
  try {
    assets(root);
    unlinkSync(join(root, helper));
    assert.throws(
      () => corridorAssetFiles(root),
      /Missing required asset: shared-study-audio-preparation\.mjs/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('asset admission still rejects a helper symlink', () => {
  const root = scope();
  try {
    assets(root);
    unlinkSync(join(root, helper));
    symlinkSync(join(source, helper), join(root, helper));
    assert.throws(() => corridorAssetFiles(root), /symlink/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('real QA builder copies and authenticates helper bytes while preserving source build identity', () => {
  const root = scope();
  try {
    const site = siteFixture(root),
      before = inventory(site).map((path) => [path, sha(readFileSync(join(site, path)))]),
      identity = readFileSync(join(site, 'build-identity.json'));
    const { result, output } = derive(root, site);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(output, 'qa-host-receipt.json'))),
      bytes = readFileSync(join(source, helper));
    assert.equal(receipt.productionBuild, false);
    assert.deepEqual(readFileSync(join(output, helper)), bytes);
    assert.deepEqual(
      receipt.modules.map((row) => row.path).sort(),
      [
        'corridor.js',
        'study-engine-adapter.mjs',
        'shared-study-runtime.mjs',
        helper,
        'shared-study-test-host.mjs',
        'shared-study-test-bootstrap.mjs',
        'shared-study-sync.mjs',
      ].sort(),
    );
    assert.deepEqual(
      receipt.modules.find((row) => row.path === helper),
      { path: helper, bytes: bytes.length, sha256: sha(bytes) },
    );
    const route = receipt.actualCorridorRouteInputs.find((row) => row.path === helper);
    assert(route);
    assert.equal(route.sourceArtifactSha256, sha(bytes));
    assert.equal(route.currentSourceSha256, sha(bytes));
    assert.deepEqual(readFileSync(join(output, 'build-identity.json')), identity);
    assert.equal(receipt.sourceBuildIdentity.mutated, false);
    assert.equal(receipt.sourceBuildIdentity.sha256, sha(identity));
    assert.deepEqual(
      inventory(site).map((path) => [path, sha(readFileSync(join(site, path)))]),
      before,
    );
    verifyBundledArtifact(site);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
for (const variant of ['missing', 'changed'])
  test(`QA rejects an authenticated source with ${variant} helper before creating output`, () => {
    const root = scope();
    try {
      const site = siteFixture(root, variant);
      const { result, output } = derive(root, site);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /shared-study-audio-preparation\.mjs/);
      assert.equal(existsSync(output), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
test('QA refuses a source-directory symlink alias', () => {
  const root = scope();
  try {
    const site = siteFixture(root),
      alias = join(root, 'alias');
    symlinkSync(site, alias, 'dir');
    const { result, output } = derive(root, alias);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /symlink alias/);
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('QA refuses an unmanifested private artifact entry', () => {
  const root = scope();
  try {
    const site = siteFixture(root);
    put(join(site, 'learner-private.json'), 'private fixture sentinel');
    const { result, output } = derive(root, site);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /learner-private\.json/);
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('QA keeps the portable artifact symlink guard for the helper', () => {
  const root = scope();
  try {
    const site = siteFixture(root);
    unlinkSync(join(site, helper));
    symlinkSync(join(source, helper), join(site, helper));
    const { result, output } = derive(root, site);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must not contain symlinks/);
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
