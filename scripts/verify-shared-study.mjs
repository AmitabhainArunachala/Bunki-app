#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  source = resolve(repo, 'prototypes/corridor');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (path) => readFileSync(resolve(source, path));
const vendor = 'vendor/shared-study-engine',
  manifest = JSON.parse(read(`${vendor}/engine-manifest.json`));
const pin = JSON.parse(readFileSync(resolve(repo, 'scripts/shared-study-pin.json'), 'utf8'));
// Authenticate the verifier before executing code supplied by the distribution.
if (digest(read(`${vendor}/tools/verify_engine.mjs`)) !== pin.verifierSha256)
  throw Error('Canonical verifier differs from reviewed Bunki pin');
const { verifyEngineDistribution } = await import(
  pathToFileURL(resolve(source, vendor, 'tools/verify_engine.mjs')).href
);
verifyEngineDistribution(resolve(source, vendor), {
  expectedClosureSha256: pin.closureSha256,
  requireCommitted: true,
});
if (manifest.source.commit !== pin.sourceCommit)
  throw Error('Canonical source commit differs from reviewed Bunki pin');
if (digest(read('data/shared-study-content.json')) !== pin.contentBindingSha256)
  throw Error('Content binding differs from reviewed Bunki pin');
if (manifest.format !== 'nihongo-study-engine-distribution/v1' || !manifest.ui?.entry)
  throw Error('Canonical engine/UI distribution required');
const { verifySharedDictionaryArtifact } = await import('./shared-study-binding.mjs');
const binding = JSON.parse(read('data/shared-study-content.json'));
const dictionaryModules = {
  loader: 'client/app/dictionary-loader.mjs',
  prepare: 'client/player/dictionary.mjs',
};
for (const [key, path] of Object.entries(dictionaryModules))
  if (manifest.ui.dictionary?.[key] !== path || !manifest.files.some((file) => file.path === path))
    throw Error('Canonical dictionary modules are not exported');
await verifySharedDictionaryArtifact(
  binding,
  read('data/shared-study/BUILD.json'),
  read('data/shared-study/dictionary.json.gz'),
);
for (const [id, row] of Object.entries(binding.packs))
  if (digest(read(`decks/${id}/deck.json`)) !== row.sha256)
    throw Error(`Shared pack binding stale: ${id}`);
for (const [name, hash] of Object.entries(binding.grammarAssets))
  if (digest(read(`data/shared-study/${name}`)) !== hash)
    throw Error(`Shared grammar drift: ${name}`);
// Matching an import line in source proves only that the string exists, not that the UI mounts.
// Executable mount coverage lives in scripts/verify-shared-study-browser.mjs, which loads the
// built shared-frame page in a browser and exercises the mounted app; this verifier makes no
// claim about mounted UI and does not treat any earlier browser receipt as current.
console.log(
  JSON.stringify({
    canonicalFiles: manifest.files.length,
    sourceCommit: manifest.source.commit,
    sourceMode: manifest.source.mode,
    engineClosure: manifest.closureSha256,
    tasks: binding.counts,
    dictionary: {
      bytes: binding.dictionary.bytes,
      jsonBytes: binding.dictionary.jsonBytes,
      sha256: binding.dictionary.sha256,
    },
  }),
);
