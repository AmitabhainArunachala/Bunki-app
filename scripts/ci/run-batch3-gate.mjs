/** Fresh artifact-bound launch of a complete accepted native lane. No native result is rewritten. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BATCH3_SUITES,
  batch3CanonicalEnvironment,
  loadBatch3Pins,
  readBatch3Evidence,
  makeBatch3Admission,
  E2_BASE_TOOL,
  readBatch3Base,
} from './vh-batch3-report-contracts.mjs';

export async function runBatch3Gate({ root, siteDir, out, suite, env }) {
  assert(BATCH3_SUITES.includes(suite));
  assert(['chromium', 'webkit'].includes(env.KAIRO_BROWSER));
  assert(typeof env.KAIRO_GATE_RUN_ID === 'string' && env.KAIRO_GATE_RUN_ID.length > 0);
  assert(siteDir && out);
  out = resolve(out);
  if (existsSync(out)) {
    const stat = lstatSync(out);
    assert(stat.isDirectory() && !stat.isSymbolicLink());
    assert.equal(readdirSync(out).length, 0, 'Use fresh lane evidence');
  }
  mkdirSync(out, { recursive: true });
  let child = null;
  try {
    const input = { root, siteDir, suite, engine: env.KAIRO_BROWSER, runId: env.KAIRO_GATE_RUN_ID };
    const pins = loadBatch3Pins(input);
    assert.equal(env.KAIRO_ARTIFACT_SHA256, pins.identity.artifactSha256);
    const { acceptanceEnvironment } = await import(
      pathToFileURL(resolve(root, 'scripts/ci/verification-admission.mjs'))
    );
    const childEnv = batch3CanonicalEnvironment(
      acceptanceEnvironment(env, {
        KAIRO_BROWSER: pins.engine,
        KAIRO_GATE_RUN_ID: pins.runId,
        KAIRO_SITE_DIR: pins.siteDir,
        KAIRO_ARTIFACT_SHA256: pins.identity.artifactSha256,
        KAIRO_EVIDENCE_DIR: out,
      }),
      suite,
      pins.engine,
    );
    if (suite === 'hfix2e2') {
      const baseDir = join(realpathSync(out), 'e2-base');
      assert(!existsSync(baseDir), 'The canonical gate creates its own fresh baseline');
      const baseArgv = [E2_BASE_TOOL, '--head', pins.identity.gitSha, '--out', baseDir];
      const baseResult = spawnSync(process.execPath, baseArgv, {
        cwd: root,
        env: childEnv,
        stdio: 'inherit',
      });
      const baseChild = {
        argv: baseArgv,
        status: baseResult.status,
        signal: baseResult.signal,
        error: baseResult.error ? String(baseResult.error) : null,
      };
      writeFileSync(join(out, 'base-process.json'), JSON.stringify(baseChild, null, 2) + '\n');
      if (baseResult.error) throw baseResult.error;
      assert.equal(baseResult.signal, null, 'E2 baseline builder interrupted');
      assert.equal(baseResult.status, 0, 'E2 baseline builder failed');
      const baseline = readBatch3Base(out, pins);
      // Inject only the gate-owned verified output after stripping every ambient override.
      childEnv.HFIX2E2_BASE_DIR = baseline.dir;
      childEnv.HFIX2E2_BASE_SHA256 = ['corridor.js', 'editorial.css']
        .map((name) => pins.baseline.sha256[name])
        .join(',');
    }
    const argv = [`prototypes/corridor/tools/verify-${suite}.mjs`];
    const result = spawnSync(process.execPath, argv, {
      cwd: root,
      env: childEnv,
      stdio: 'inherit',
    });
    child = {
      argv,
      status: result.status,
      signal: result.signal,
      error: result.error ? String(result.error) : null,
    };
    // Always preserve the process outcome, including a red or interrupted native child.
    writeFileSync(join(out, 'native-process.json'), JSON.stringify(child, null, 2) + '\n');
    if (result.error) throw result.error;
    assert.equal(result.signal, null, 'Native child interrupted');
    assert.equal(result.status, 0, 'Native lane reports a failure');
    assert.deepEqual(
      loadBatch3Pins(input),
      pins,
      'Artifact or producer changed during native execution',
    );
    const evidence = readBatch3Evidence(out, pins);
    writeFileSync(
      join(out, 'lane-admission.json'),
      JSON.stringify(makeBatch3Admission(evidence, pins, child), null, 2) + '\n',
    );
    return 0;
  } catch (error) {
    writeFileSync(
      join(out, 'lane-admission-failure.json'),
      JSON.stringify({ suite, child, error: error.stack || String(error) }, null, 2) + '\n',
    );
    throw error;
  }
}
