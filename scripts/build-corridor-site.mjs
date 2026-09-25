#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildCorridorModules } from './build-reading-module.mjs';
import { assetFilesUnder, corridorAssetFiles } from './corridor-assets.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(repo, 'prototypes/corridor');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--out' || !isAbsolute(args[1])) {
  console.error('Usage: node scripts/build-corridor-site.mjs --out /absolute/new/site-directory');
  process.exit(2);
}

const output = resolve(args[1]);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...argv) => execFileSync('git', ['-C', repo, ...argv], { encoding: 'utf8' }).trim();

function inside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function canonicalDestination(path) {
  let ancestor = path;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  return resolve(realpathSync(ancestor), relative(ancestor, path));
}

const inputOrder = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const moduleIdentity = (module) => ({
  path: module.path,
  compiler: module.compiler,
  inputs: module.inputs,
});
const sourceInputs = (files, modules) =>
  [
    ...files.map((path) => ({
      path: relative(source, path).split(sep).join('/'),
      sha256: digest(readFileSync(path)),
    })),
    ...modules.map((module) => ({ path: module.path, sha256: digest(module.bytes) })),
  ].sort(inputOrder);

let staging;
try {
  const destination = canonicalDestination(output);
  if (inside(realpathSync(repo), destination)) {
    throw new Error(
      'Build output must be outside the checkout; use ~/.dharma/ locally or RUNNER_TEMP in CI.',
    );
  }
  const allowedRoots = [join(homedir(), '.dharma')];
  if (process.env.CI && process.env.RUNNER_TEMP) allowedRoots.push(process.env.RUNNER_TEMP);
  if (!allowedRoots.some((path) => inside(canonicalDestination(path), destination))) {
    throw new Error('Build output must be under ~/.dharma or CI RUNNER_TEMP.');
  }
  if (existsSync(output))
    throw new Error('Output already exists; choose a new directory. No files were replaced.');
  for (const path of [
    'corridor.js',
    'reading-controller.mjs',
    'teacher-context.mjs',
    'teacher-drafts.mjs',
    'teacher-draft-controller.mjs',
    'sentence-drafts.mjs',
    'sentence-draft-controller.mjs',
    'reading-position.mjs',
    'feed-controller.mjs',
    'assessment-controller.mjs',
    'assessment-v2-controller.mjs',
    'assessment-learning.mjs',
    'assessment-view.mjs',
    'assessment-delivery.mjs',
    'assessment-cloze.mjs',
    'assessment-received.mjs',
    'assessment-enrichment.mjs',
    'assessment-finalization.mjs',
    'record-controller.mjs',
    'record-host.mjs',
    'record-app.mjs',
    'record-binding.mjs',
    'record-sync.mjs',
    'publisher-controller.mjs',
    'source-inbox.mjs',
    'source-processing.mjs',
    'sentence-practice.mjs',
    'corridor-ink.js',
    'dictionary-worker.js',
    'skip-core.js',
    'skip-ui.js',
    'reference-core.js',
    'reference-ui.js',
    'sw.js',
  ]) {
    execFileSync(process.execPath, ['--check', join(source, path)], { stdio: 'pipe' });
  }
  const gitSha = git('rev-parse', 'HEAD');
  const sourceDirty = git('status', '--porcelain', '--untracked-files=normal') !== '';
  const modules = buildCorridorModules(repo);
  const moduleByPath = new Map(modules.map((module) => [module.path, module]));
  const inputs = sourceInputs(corridorAssetFiles(source), modules);
  if (new Set(inputs.map((file) => file.path)).size !== inputs.length)
    throw new Error('Duplicate runtime asset path');
  mkdirSync(dirname(output), { recursive: true });
  staging = mkdtempSync(join(dirname(output), '.kairo-stage-'));
  for (const file of inputs) {
    const destination = join(staging, file.path);
    mkdirSync(dirname(destination), { recursive: true });
    if (moduleByPath.has(file.path)) writeFileSync(destination, moduleByPath.get(file.path).bytes);
    else copyFileSync(join(source, file.path), destination);
    if (digest(readFileSync(destination)) !== file.sha256) {
      throw new Error(`Source changed during assembly: ${file.path}`);
    }
  }
  // The cache identity follows the complete unstamped asset set. This avoids
  // both manual version bumps and a circular hash of the stamped worker.
  const sourceAssetSha256 = digest(JSON.stringify(inputs));
  writeFileSync(
    join(staging, 'sw.js'),
    `self.KAIRO_ASSET_VERSION = ${JSON.stringify(sourceAssetSha256)};\n${readFileSync(join(source, 'sw.js'), 'utf8')}`,
  );
  copyFileSync(join(staging, 'index.html'), join(staging, '404.html'));
  const manifestFiles = assetFilesUnder(staging).map((path) => {
    const bytes = readFileSync(path);
    return {
      path: relative(staging, path).split(sep).join('/'),
      bytes: bytes.length,
      sha256: digest(bytes),
    };
  });
  if (git('rev-parse', 'HEAD') !== gitSha) throw new Error('The checkout changed during assembly.');
  const currentModules = buildCorridorModules(repo);
  const currentInputs = sourceInputs(corridorAssetFiles(source), currentModules);
  if (
    JSON.stringify(currentInputs) !== JSON.stringify(inputs) ||
    JSON.stringify(currentModules.map(moduleIdentity)) !==
      JSON.stringify(modules.map(moduleIdentity))
  ) {
    throw new Error('Assets changed during assembly; rebuild once the source is stable.');
  }
  const manifest = {
    schemaVersion: 1,
    product: 'KAIRO',
    gitSha,
    sourceDirty,
    sourceAssetSha256,
    artifactSha256: digest(JSON.stringify(manifestFiles)),
    modules: modules.map(moduleIdentity),
    files: manifestFiles,
  };
  writeFileSync(join(staging, 'build-identity.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (existsSync(output))
    throw new Error('Output appeared during assembly; refusing to replace it.');
  renameSync(staging, output);
  staging = undefined;
  console.log(
    JSON.stringify(
      {
        output,
        gitSha,
        sourceDirty,
        artifactSha256: manifest.artifactSha256,
        files: manifestFiles.length,
        bytes: manifestFiles.reduce((total, file) => total + file.bytes, 0),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (staging) rmSync(staging, { recursive: true, force: true });
}
