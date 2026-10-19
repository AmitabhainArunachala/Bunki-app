/** Run the unchanged SRS assertions and controls for this lane. The shared verifier
 * waits 30 seconds for each legitimately absent optional element. These three
 * reads follow explicit card/grade readiness checks, so inspect absence directly.
 * No schedule, assertion, fixture, clock or mutation is changed. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

assert(['webkit', 'chromium'].includes(process.env.KAIRO_BROWSER), 'One engine at a time');
assert.deepEqual(process.argv.slice(2), ['--only', 'john,steps,p0'], 'Only the requested player rows');
const out = resolveCorridorEvidence(); mkdirSync(out, { recursive: true });
const source = new URL('./verify-srs-conformance.mjs', import.meta.url);
const original = readFileSync(source, 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let adapted = original.replace(/from '([^']+)'/gu, (whole, specifier) => specifier.startsWith('.')
  ? `from ${JSON.stringify(new URL(specifier, source).href)}`
  : specifier.startsWith('node:') ? whole : `from ${JSON.stringify(import.meta.resolve(specifier))}`);
const replacements = [];
function replaceOnce(before, after) {
  assert.equal(adapted.split(before).length, 2, 'Unique SRS adapter seam');
  adapted = adapted.replace(before, after); replacements.push({ before, after });
}
replaceOnce("const TOOL_DIR = fileURLToPath(new URL('.', import.meta.url));", `const TOOL_DIR = fileURLToPath(new URL('.', ${JSON.stringify(source.href)}));`);
replaceOnce('createRequire(import.meta.url)', `createRequire(${JSON.stringify(source.href)})`);
replaceOnce("return page.locator('#kp-card').getAttribute('data-card').catch(() => null);",
  "return await page.locator('#kp-card').count() ? page.locator('#kp-card').getAttribute('data-card') : null;");
replaceOnce("const stepNote = await page.locator('.kp-stepnote').textContent().catch(() => null);",
  "const stepNote = await page.locator('.kp-stepnote').count() ? await page.locator('.kp-stepnote').textContent() : null;");
replaceOnce("out.pause = (await page.locator('#kp-pause').textContent().catch(() => '')) || '';",
  "out.pause = await page.locator('#kp-pause').count() ? (await page.locator('#kp-pause').textContent()) || '' : '';");
const runner = join(out, 'hfix2c-srs-runner.mjs'); writeFileSync(runner, adapted);
writeFileSync(join(out, 'adapter.json'), JSON.stringify({ original: source.href, originalSha256: sha(original),
  adapterSha256: sha(readFileSync(new URL(import.meta.url))), runnerSha256: sha(adapted), replacements,
  scope: 'Original john/steps/p0 scenarios, clocks, assertions and negative controls; only optional DOM reads avoid absence timeouts.' }, null, 2));
const result = spawnSync(process.execPath, [runner, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
