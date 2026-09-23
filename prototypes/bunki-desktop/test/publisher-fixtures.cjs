'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { externalPath } = require('../lib/paths.cjs');
const { verifyBundledArtifact } = require('../lib/artifact.cjs');

/** Real canonical browser module; original fixtures are compiled outside the checkout. */
async function loadPublisherFixtures(lane) {
  const evidence = externalPath(process.env.KAIRO_EVIDENCE_DIR || path.join(os.homedir(), '.dharma', 'bunki-desktop', 'publisher-tests'));
  fs.mkdirSync(evidence, { recursive: true });
  const output = fs.mkdtempSync(path.join(evidence, lane + '-'));
  const site = process.env.KAIRO_SITE_DIR || (await import('../../../scripts/resolve-corridor-site.mjs')).resolveCorridorSite();
  const identity = verifyBundledArtifact(site);
  const module = identity.files.find((row) => row.path === 'modules/feed-core.mjs');
  assert(module, 'Canonical artifact must include compiled feed core');
  const core = await import(pathToFileURL(path.join(site, module.path)).href);
  assert.equal(typeof core.createGlobalVoicesArticle, 'function', 'Rebuild stale artifact for publisher reader');
  const repo = path.resolve(__dirname, '../../..');
  const { buildSync } = require(path.join(repo, 'node_modules/esbuild'));
  const fixtureFile = path.join(output, 'original-fixtures.mjs');
  const build = buildSync({ absWorkingDir: repo, entryPoints: ['packages/feed/test/full-reader/fixtures.ts'], outfile: fixtureFile, bundle: true, platform: 'node', format: 'esm', minify: true, write: false });
  const bytes = Buffer.from(build.outputFiles[0].contents);
  fs.writeFileSync(fixtureFile, bytes, { flag: 'wx' });
  const fixture = await import(pathToFileURL(fixtureFile).href);
  fs.writeFileSync(path.join(output, 'artifact.json'), JSON.stringify({ site, artifactSha256: identity.artifactSha256, feedModule: module, fixtureSha256: createHash('sha256').update(bytes).digest('hex'), fixtureKind: 'original synthetic text; no publisher article body' }, null, 2));
  return { core, fixture, output };
}

module.exports = { loadPublisherFixtures };
