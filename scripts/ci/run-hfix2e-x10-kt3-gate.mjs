import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBatch3Gate } from './run-batch3-gate.mjs';
try {
  assert.equal(process.argv.length, 2, 'No selectors or alternate native arguments');
  process.exitCode = await runBatch3Gate({
    root: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
    suite: 'hfix2e-x10-kt3',
    siteDir: process.env.KAIRO_SITE_DIR,
    out: process.env.KAIRO_EVIDENCE_DIR,
    env: process.env,
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
