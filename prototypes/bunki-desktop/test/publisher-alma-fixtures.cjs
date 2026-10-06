'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { externalPath } = require('../lib/paths.cjs');
const { verifyBundledArtifact } = require('../lib/artifact.cjs');

/** Repository-local synthetic article and reviewed policy fixtures, never live requests. */
async function loadAlmaFixtures() {
  const evidence = externalPath(
    process.env.KAIRO_EVIDENCE_DIR ||
      path.join(os.homedir(), '.dharma', 'bunki-desktop', 'publisher-tests'),
  );
  fs.mkdirSync(evidence, { recursive: true });
  const output = fs.mkdtempSync(path.join(evidence, 'publisher-alma-'));
  const site =
    process.env.KAIRO_SITE_DIR ||
    (await import('../../../scripts/resolve-corridor-site.mjs')).resolveCorridorSite();
  const identity = verifyBundledArtifact(site);
  const module = identity.files.find((row) => row.path === 'modules/feed-core.mjs');
  assert(module, 'Canonical artifact must include the compiled feed core');
  const core = await import(pathToFileURL(path.join(site, module.path)).href);
  assert.equal(
    typeof core.createAlmaArticle,
    'function',
    'Rebuild stale artifact for the ALMA reader',
  );
  const repo = path.resolve(__dirname, '../../..');
  const fixtureRoot = path.join(repo, 'packages/feed/test/full-reader');
  const policy = fs.readFileSync(path.join(fixtureRoot, 'alma/reviewed-rights-section.html'));
  const provenance = JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, 'alma/policy-provenance.json'), 'utf8'),
  );
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  assert.equal(
    hash(policy),
    provenance.fixtureSha256,
    'Reviewed policy fixture changed without provenance',
  );
  const { buildSync } = require(path.join(repo, 'node_modules/esbuild'));
  const fixtureFile = path.join(output, 'original-alma-fixtures.mjs');
  const build = buildSync({
    absWorkingDir: repo,
    entryPoints: ['packages/feed/test/full-reader/alma-fixtures.ts'],
    outfile: fixtureFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    minify: true,
    write: false,
  });
  const bytes = Buffer.from(build.outputFiles[0].contents);
  fs.writeFileSync(fixtureFile, bytes, { flag: 'wx' });
  // The bundled fixture intentionally reads this explicit sibling data file.
  fs.mkdirSync(path.join(output, 'alma'));
  fs.writeFileSync(path.join(output, 'alma/reviewed-rights-section.html'), policy, { flag: 'wx' });
  const fixture = await import(pathToFileURL(fixtureFile).href);
  assert.equal(hash(fixture.RIGHTS), provenance.fixtureSha256);
  fs.writeFileSync(
    path.join(output, 'artifact.json'),
    JSON.stringify(
      {
        site,
        artifactSha256: identity.artifactSha256,
        feedModule: module,
        fixtureSha256: hash(bytes),
        policyProvenance: provenance,
        fixtureKind:
          'original synthetic article; exact reviewed legal text; no publisher article body or live requests',
      },
      null,
      2,
    ),
  );
  return { core, fixture, output };
}

module.exports = { loadAlmaFixtures };
