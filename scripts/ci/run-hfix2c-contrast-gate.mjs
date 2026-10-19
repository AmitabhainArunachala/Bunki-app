/** Narrow lane admission; the shared sweep remains a diagnostic child (exit 3). */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptanceEnvironment } from './verification-admission.mjs';
import { loadHfix2cPins, readHfix2cContrastEvidence, hfix2cLaneAdmission } from './vh-hfix2c-report-contracts.mjs';

export function runHfix2cContrastGate({ root, siteDir, out, env }) {
  assert(['chromium', 'webkit'].includes(env.KAIRO_BROWSER));
  assert(typeof env.KAIRO_GATE_RUN_ID === 'string' && env.KAIRO_GATE_RUN_ID.length > 0);
  assert(!existsSync(out) || readdirSync(out).length === 0, 'Use fresh lane evidence');
  mkdirSync(out, { recursive: true });
  let childExitCode = null;
  try {
    const input = { root, siteDir, engine: env.KAIRO_BROWSER, runId: env.KAIRO_GATE_RUN_ID };
    const pins = loadHfix2cPins(input);
    assert.equal(env.KAIRO_ARTIFACT_SHA256, pins.artifactSha256);
    const childEnv = acceptanceEnvironment(env, { KAIRO_BROWSER: pins.engine,
      KAIRO_GATE_RUN_ID: pins.runId, KAIRO_SITE_DIR: pins.siteDir,
      KAIRO_ARTIFACT_SHA256: pins.artifactSha256, KAIRO_EVIDENCE_DIR: resolve(out) });
    for (const key of Object.keys(childEnv)) if (/^(?:SWEEP_|HFIX2C_)/u.test(key)) delete childEnv[key];
    const child = spawnSync(process.execPath, ['prototypes/corridor/tools/verify-hfix2c-contrast.mjs'],
      { cwd: root, env: childEnv, stdio: 'inherit' });
    childExitCode = child.status;
    if (child.error) throw child.error;
    assert.equal(child.signal, null, 'Contrast child was interrupted');
    assert.equal(child.status, 3, 'Only diagnostic child success (3) enters lane admission');
    assert.deepEqual(loadHfix2cPins(input), pins, 'Source or artifact changed during lane execution');
    const evidence = readHfix2cContrastEvidence(out, pins);
    writeFileSync(join(out, 'lane-admission.json'), JSON.stringify(hfix2cLaneAdmission(evidence, pins), null, 2) + '\n');
    return 0;
  } catch (error) {
    writeFileSync(join(out, 'lane-admission-failure.json'), JSON.stringify({ childExitCode, error: error.stack || String(error) }, null, 2) + '\n');
    throw error;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 2, 'No lane selectors or alternate producer arguments');
    process.exitCode = runHfix2cContrastGate({ root: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
      siteDir: process.env.KAIRO_SITE_DIR, out: process.env.KAIRO_EVIDENCE_DIR, env: process.env });
  } catch (error) { console.error(error); process.exitCode = 1; }
}
