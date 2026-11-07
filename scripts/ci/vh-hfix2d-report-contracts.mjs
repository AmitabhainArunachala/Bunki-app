/** Hfix-2d's accepted, occurrence-preserving native-browser receipt contract. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const HFIX2D = JSON.parse(
  readFileSync(new URL('./vh-hfix2d-roster.json', import.meta.url), 'utf8'),
);
export const hfix2dDigest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const HFIX2D_HELPERS = Object.freeze([
  'scripts/serve-corridor-dev.mjs',
  'scripts/resolve-corridor-site.mjs',
  'prototypes/corridor/tools/browser-audio-silence.mjs',
  'prototypes/bunki-desktop/lib/static-host.cjs',
  'prototypes/bunki-desktop/lib/artifact.cjs',
]);
const sha = (value) => assert.match(value || '', /^[a-f0-9]{64}$/u, 'Missing SHA-256 pin');
const nonempty = (value) =>
  assert(typeof value === 'string' && value.trim().length > 0, 'Missing attempt identity');
const finite = (value) => assert(Number.isFinite(value), 'Nonfinite measurement');
export function loadHfix2dPins({ root, siteDir, engine, runId }) {
  assert(['chromium', 'webkit'].includes(engine));
  nonempty(runId);
  const site = realpathSync(siteDir),
    identity = JSON.parse(readFileSync(join(site, 'build-identity.json'), 'utf8'));
  assert.equal(identity.schemaVersion, 1);
  assert.equal(identity.product, 'KAIRO');
  assert.equal(identity.sourceDirty, false);
  sha(identity.artifactSha256);
  assert.match(identity.gitSha || '', /^[a-f0-9]{40}$/u);
  // These are the only product files the accepted lane changes. The canonical
  // runner/resolver also verifies the complete immutable artifact manifest.
  for (const file of ['corridor.js', 'corridor.css', 'guided-session.css']) {
    const expected = identity.files.find((row) => row.path === file)?.sha256;
    sha(expected);
    assert.equal(
      hfix2dDigest(readFileSync(join(site, file))),
      expected,
      `Artifact changed: ${file}`,
    );
  }
  return {
    engine,
    runId,
    siteDir: site,
    identity,
    artifactSha256: identity.artifactSha256,
    verifierSha256: hfix2dDigest(
      readFileSync(resolve(root, 'prototypes/corridor/tools/verify-hfix2d.mjs')),
    ),
    helperSha256: Object.fromEntries(
      HFIX2D_HELPERS.map((file) => [file, hfix2dDigest(readFileSync(resolve(root, file)))]),
    ),
  };
}
export function validateHfix2dReport(value, p) {
  assert(['chromium', 'webkit'].includes(p.engine));
  nonempty(p.runId);
  sha(p.artifactSha256);
  sha(p.verifierSha256);
  assert.equal(p.identity.schemaVersion, 1);
  assert.equal(p.identity.product, 'KAIRO');
  assert.equal(p.identity.sourceDirty, false);
  assert.equal(p.identity.artifactSha256, p.artifactSha256);
  assert.match(p.identity.gitSha || '', /^[a-f0-9]{40}$/u);
  nonempty(p.siteDir);
  assert.deepEqual(Object.keys(p.helperSha256), HFIX2D_HELPERS);
  for (const hash of Object.values(p.helperSha256)) sha(hash);
  assert.equal(value.schemaVersion, 2);
  assert.equal(value.suite, 'hfix2d');
  assert.equal(value.scope, 'full');
  assert.equal(value.control, null);
  assert.equal(value.pass, true);
  assert.equal(value.runId, p.runId);
  assert.equal(value.site, p.siteDir);
  assert.deepEqual(value.engines, [p.engine]);
  assert.deepEqual(Object.keys(value.browserVersions), [p.engine]);
  nonempty(value.browserVersions[p.engine]);
  assert.equal(value.expectedGitSha, p.identity.gitSha);
  assert.equal(value.artifactSha256, p.artifactSha256);
  assert.equal(
    hfix2dDigest(JSON.stringify(value.identity)),
    hfix2dDigest(JSON.stringify(p.identity)),
    'Foreign artifact identity',
  );
  assert.equal(value.verifierSha256, p.verifierSha256);
  assert.deepEqual(value.helperSha256, p.helperSha256);
  assert.deepEqual(value.summary, { total: 368, passed: 368, failed: 0 });
  assert.equal(value.checks.length, 368);
  // Six labels intentionally recur. Never deduplicate: index + exact name is
  // the occurrence identity, including the final expected-commit assertion.
  assert.deepEqual(
    value.checks.map((row) => row.name),
    HFIX2D.rows.map((row) => row.name.replace(' · ENGINE · ', ` · ${p.engine} · `)),
  );
  for (let i = 0; i < HFIX2D.rows.length; i++) {
    const row = value.checks[i],
      expected = HFIX2D.rows[i];
    assert.equal(row.pass, true, `Failed occurrence ${i + 1}`);
    assert.equal(typeof row.detail, 'string');
    if (Object.hasOwn(expected, 'detail'))
      assert.equal(row.detail, expected.detail, `Changed P/K/U observation ${i + 1}`);
    else if (row.name.startsWith('identity · '))
      assert.equal(row.detail, `${p.identity.gitSha} === ${p.identity.gitSha}`);
    else {
      const d = JSON.parse(row.detail);
      if (row.name.startsWith('C · ')) {
        finite(d.ratio);
        assert(d.ratio >= 4.5);
        finite(d.opacity);
        assert(d.opacity >= 0 && d.opacity <= 1);
        assert.equal(d.text, '〔スポーツ〕');
      } else if (row.name.endsWith('no page error')) assert.deepEqual(d, []);
      else if (row.name.includes('the begin control sits')) {
        const width = Number(row.name.split(' · ')[2]);
        assert.equal(d.iw, width);
        assert.equal(d.vh, width === 390 ? 844 : 900);
        finite(d.begin?.top);
        finite(d.begin?.bottom);
        assert(d.begin.top >= 0 && d.begin.bottom <= Math.min(d.vh, 844));
      } else if (row.name.includes('the begin label is centred')) {
        finite(d.above);
        finite(d.below);
        assert(d.above >= 0 && Math.abs(d.above - d.below) <= 3);
      } else if (row.name.includes('the box is filled')) {
        finite(d.box?.top);
        finite(d.box?.h);
        finite(d.restCount);
        finite(d.restH);
        finite(d.metaBottom);
        assert(
          d.restCount >= 1 &&
            d.restH >= 100 &&
            d.metaBottom &&
            d.metaBottom <= d.box.top + d.box.h + 2,
        );
      } else if (row.name.includes('the arrival keeps')) {
        finite(d.w);
        assert(d.w >= 300 && d.w <= 980);
      } else assert.fail(`Unclassified occurrence ${i + 1}`);
    }
  }
  return true;
}
