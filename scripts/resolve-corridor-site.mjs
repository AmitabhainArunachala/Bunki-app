/** Select one complete immutable Corridor runtime per process. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyArtifact } from './verify-release-gates.mjs';
import { verifyBundledArtifact } from '../prototypes/bunki-desktop/lib/artifact.cjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let evidence;
let selected;
let requested;
let requestedDigest;

const inside = (parent, child) => {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};
function canonical(path) {
  let parent = resolve(path);
  while (!existsSync(parent)) parent = dirname(parent);
  return resolve(realpathSync(parent), relative(parent, resolve(path)));
}

export function resolveCorridorEvidence() {
  if (evidence) return evidence;
  const supplied = process.env.KAIRO_EVIDENCE_DIR;
  const base =
    supplied === undefined
      ? join(
          homedir(),
          '.dharma',
          'bunki',
          'corridor',
          basename(process.argv[1] || 'runtime', '.mjs'),
        )
      : supplied;
  assert(isAbsolute(base), 'KAIRO_EVIDENCE_DIR must be an absolute external path');
  const out = canonical(base);
  const roots = [join(homedir(), '.dharma')];
  if (process.env.CI && process.env.RUNNER_TEMP) roots.push(process.env.RUNNER_TEMP);
  assert(
    !inside(realpathSync(ROOT), out),
    'Runtime evidence must not be written into the checkout',
  );
  assert(
    roots.some((root) => inside(canonical(root), out)),
    'Runtime evidence must be under ~/.dharma or CI RUNNER_TEMP',
  );
  mkdirSync(out, { recursive: true });
  evidence = supplied === undefined ? mkdtempSync(join(out, 'run-')) : out;
  return evidence;
}

export function resolveCorridorSite() {
  const supplied = process.env.KAIRO_SITE_DIR;
  const suppliedDigest = process.env.KAIRO_ARTIFACT_SHA256;
  if (selected) {
    assert.equal(supplied, requested, 'A process cannot switch its tested Corridor artifact');
    assert.equal(
      suppliedDigest,
      requestedDigest,
      'A process cannot switch its pinned artifact digest',
    );
    return selected;
  }
  const run = mkdtempSync(join(resolveCorridorEvidence(), 'runtime-'));
  const receipt = {
    schemaVersion: 1,
    mode: supplied === undefined ? 'assembled' : 'supplied',
    status: 'pending',
  };
  try {
    let site;
    if (supplied !== undefined) {
      assert(isAbsolute(supplied), 'KAIRO_SITE_DIR must name an absolute staged artifact');
      site = realpathSync(supplied);
    } else {
      site = join(run, 'site');
      const output = execFileSync(
        process.execPath,
        [join(ROOT, 'scripts/build-corridor-site.mjs'), '--out', site],
        { cwd: ROOT, encoding: 'utf8', timeout: 120_000 },
      );
      writeFileSync(join(run, 'assembly.json'), output);
    }
    // An explicit digest permits testing a prior immutable candidate while
    // another worker edits source. Publication still uses verifyArtifact with
    // source identity and clean-tree requirements in the release runner.
    let identity;
    if (suppliedDigest !== undefined) {
      assert(supplied !== undefined, 'A pinned digest requires KAIRO_SITE_DIR');
      assert.match(suppliedDigest, /^[a-f0-9]{64}$/u);
      const bundled = verifyBundledArtifact(site);
      assert.equal(
        bundled.artifactSha256,
        suppliedDigest,
        'Artifact differs from the explicitly pinned candidate',
      );
      identity = {
        gitSha: bundled.gitSha,
        sourceDirty: bundled.sourceDirty,
        artifactSha256: bundled.artifactSha256,
        sourceAssetSha256: bundled.sourceAssetSha256,
      };
    } else identity = verifyArtifact(site);
    const manifest = JSON.parse(readFileSync(join(site, 'build-identity.json'), 'utf8'));
    Object.assign(receipt, {
      status: 'passed',
      ...identity,
      sourceCompared: suppliedDigest === undefined,
      modules: manifest.modules,
    });
    writeFileSync(join(run, 'selection.json'), JSON.stringify(receipt, null, 2) + '\n');
    requested = supplied;
    requestedDigest = suppliedDigest;
    selected = site;
    return selected;
  } catch (error) {
    if (error.stdout || error.stderr) {
      writeFileSync(
        join(run, 'assembly-error.log'),
        String(error.stdout || '') + String(error.stderr || ''),
      );
    }
    Object.assign(receipt, { status: 'failed', error: error.message });
    writeFileSync(join(run, 'selection.json'), JSON.stringify(receipt, null, 2) + '\n');
    throw error;
  }
}
