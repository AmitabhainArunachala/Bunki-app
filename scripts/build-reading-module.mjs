/** Compile shared implementations for the static/native app.
 * Nothing is emitted into the checkout. Callers stage the returned bytes with
 * the rest of the app, and the release verifier rebuilds them from source.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { buildSync, version } from 'esbuild';

export const READING_MODULE_PATH = 'modules/reading-core.mjs';
export const FEED_MODULE_PATH = 'modules/feed-core.mjs';
export const ASSESSMENT_MODULE_PATH = 'modules/assessment-core.mjs';
export const RECORD_MODULE_PATH = 'modules/record-core.mjs';
export const LEARNING_MODULE_PATH = 'modules/learning-core.mjs';

function buildCoreModule(
  root,
  workspace,
  modulePath,
  entryPoint = `packages/${workspace}/src/index.ts`,
) {
  const repo = realpathSync(root);
  const manifest = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8'));
  assert.equal(
    version,
    manifest.devDependencies?.esbuild,
    'The installed compiler must match the exact repository pin',
  );
  const build = buildSync({
    absWorkingDir: repo,
    entryPoints: [entryPoint],
    outfile: modulePath,
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: ['safari17', 'chrome120'],
    charset: 'utf8',
    minify: true,
    legalComments: 'inline',
    sourcemap: false,
    metafile: true,
    write: false,
    logLevel: 'silent',
  });
  assert.equal(
    build.outputFiles.length,
    1,
    'Each shared core must remain one self-contained module',
  );
  const output = Object.values(build.metafile.outputs)[0];
  assert.deepEqual(output.imports, [], 'The browser module cannot depend on undeployed imports');
  const inputs = [
    ...new Set([
      ...Object.keys(build.metafile.inputs),
      'package.json',
      'package-lock.json',
      `packages/${workspace}/package.json`,
      'packages/ai/package.json',
      'packages/domain/package.json',
      'scripts/build-reading-module.mjs',
    ]),
  ]
    .map((name) => {
      const file = realpathSync(resolve(repo, name));
      const path = relative(repo, file);
      assert(
        !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`),
        'Build inputs must belong to this checkout',
      );
      return {
        path: path.split(sep).join('/'),
        sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    path: modulePath,
    bytes: Buffer.from(build.outputFiles[0].contents),
    inputs,
    compiler: { name: 'esbuild', version },
  };
}

export function buildReadingModule(root) {
  return buildCoreModule(root, 'reading', READING_MODULE_PATH);
}

export function buildCorridorModules(root) {
  return [
    buildReadingModule(root),
    buildCoreModule(root, 'feed', FEED_MODULE_PATH),
    buildCoreModule(root, 'assessment', ASSESSMENT_MODULE_PATH),
    buildCoreModule(root, 'persistence', RECORD_MODULE_PATH, 'scripts/corridor-record-entry.ts'),
    buildCoreModule(root, 'domain', LEARNING_MODULE_PATH, 'scripts/corridor-learning-entry.ts'),
  ];
}
