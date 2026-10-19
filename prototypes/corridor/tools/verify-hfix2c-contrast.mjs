/** Hfix-2c visual-state adapter. Reuse the existing pixel-based contrast sweep
 * unchanged, replacing only its navigation schedule with the two added states.
 * The generated runner and both source hashes are retained beside its evidence.
 * This is a targeted sweep (exit 3 when green), never app-wide acceptance. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

assert(['webkit', 'chromium'].includes(process.env.KAIRO_BROWSER), 'One engine at a time');
assert(!Object.keys(process.env).some(key => key.startsWith('SWEEP_')), 'The adapter owns its exact three-state/all-world scope; clear inherited SWEEP selectors');
assert.equal(process.argv.length, 2, 'No narrowing arguments');
const runId = process.env.KAIRO_GATE_RUN_ID || randomUUID();
const out = resolveCorridorEvidence(); mkdirSync(out, { recursive: true });
const source = new URL('./verify-contrast-sweep.mjs', import.meta.url);
const original = readFileSync(source, 'utf8');
const sha = (text) => createHash('sha256').update(text).digest('hex');
let adapted = original.replace(/from '([^']+)'/gu, (whole, specifier) => specifier.startsWith('.')
  ? `from ${JSON.stringify(new URL(specifier, source).href)}`
  : specifier === 'playwright-core' ? `from ${JSON.stringify(import.meta.resolve(specifier))}` : whole);
function replaceOnce(before, after) {
  assert.equal(adapted.split(before).length, 2, 'Contrast adapter seam must be unique');
  adapted = adapted.replace(before, after);
}
replaceOnce('createRequire(import.meta.url)', `createRequire(${JSON.stringify(source.href)})`);
replaceOnce('for (const state of SETTLED_STATES)', 'for (const state of states)');
const arrival = new URL('./vh-contrast-arrival.mjs', source);
replaceOnce("new URL('./vh-contrast-arrival.mjs', import.meta.url)", `new URL(${JSON.stringify(arrival.href)})`);
replaceOnce('/* ------------------------------------------------------------------ run */', `
STEPS.page = async (page) => {
  await page.route('**/__hfix-seed', route => route.fulfill({body:'<!doctype html><title>Fixture seed</title>',contentType:'text/html'}));
  await page.goto(origin + '/__hfix-seed');
  await page.evaluate(() => localStorage.setItem('kairo-corridor-v1', JSON.stringify({v:1,taken:[{t:'kanji',id:'生',label:'生',ts:1,started:1}],srs:{},srsPrefs:{newPerDay:20}})));
  await page.goto(origin + '/index.html?entry=shelf&ui=bi'); await ready(page);
  await page.locator('#tray').click(); await page.locator('#review-start').click(); await page.locator('#reveal').click();
  await page.locator('[data-kanji-readings="complete"]').waitFor(); await settle(page,700);
};
STEPS['deck-front'] = async (page) => {
  await page.goto(origin + '/index.html?deck=n1&ui=bi'); await ready(page);
  await page.locator('#kp-start').click(); await page.locator('#kp-reveal').click();
  await page.locator('#kp-grade-good').click(); await page.locator('#kp-undo').waitFor();
  await lazySheets(page); await resting(page); await settle(page,300);
};
STEPS['deck-back'] = async (page) => {
  await page.evaluate(() => localStorage.setItem('bunki-cloze:prefs:v3:n2',JSON.stringify({sittings:4,ruleSeen:true,againCoachSeen:false})));
  await page.goto(origin + '/index.html?deck=n2&ui=bi'); await ready(page);
  await page.locator('#kp-start').click(); await page.locator('#kp-reveal').click();
  await page.locator('#kp-rule').waitFor(); await resting(page); await settle(page,300);
};
/* ------------------------------------------------------------------ run */`);
const runner = join(out, 'hfix2c-contrast-runner.mjs'); writeFileSync(runner, adapted);
writeFileSync(join(out, 'adapter.json'), JSON.stringify({ original: source.href, originalSha256: sha(original),
  adapterSha256: sha(readFileSync(new URL(import.meta.url))), runnerSha256: sha(adapted),
  arrivalPredicateSha256: sha(readFileSync(arrival)), runId, expectedRows: 255, expectedScenes: 33,
  scope: 'All eleven worlds; kanji review lesson-selection rendering, front Undo, and back coach/grade clearance. All selected-state contrast assertions retained.' }, null, 2));
const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', env: { ...process.env, KAIRO_GATE_RUN_ID: runId, SWEEP_STATES: 'page,deck-front,deck-back' } });
if (result.error) throw result.error;
const report = JSON.parse(readFileSync(join(out, `sweep-${process.env.KAIRO_BROWSER}.json`), 'utf8'));
assert.equal(result.status, 3, 'The complete targeted sweep must return diagnostic success (3)');
const worlds = ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku'];
const states = ['page', 'deck-front', 'deck-back'], engine = process.env.KAIRO_BROWSER;
const night = new Set(['rokusho', 'yoru', 'nami', 'hakuu', 'kaku']);
// This independent, ordered lane roster retains the shared C5/C8 rows and all five C8 control completions.
const expected = ['source/C7', ...worlds.flatMap(world => [
  ...states.flatMap(state => ['world', 'C8',
    ...(world === 'hokusai' && state === 'deck-front' ? ['C8-control.fade-undeclared', 'C8-control.fade-overdeclared', 'C8-control.fade-translucent-below', 'C8-control.restore', 'C8-control.record'] : []),
    'C1', ...(['deck-front', 'deck-back'].includes(state) ? ['C2'] : []), 'C3', 'C4', 'C5',
    ...(!night.has(world) ? ['C6'] : [])].map(id => `${engine}/${world}/${state}.${id}`)), `${engine}/${world}.page-errors`])];
assert.equal(expected.length, 255);
assert.equal(report.schemaVersion, 2); assert.equal(report.runId, runId);
assert.equal(report.artifactSha256, process.env.KAIRO_ARTIFACT_SHA256);
assert.equal(report.sourceDirty, false);
assert.equal(report.verifierSha256, sha(adapted));
assert.equal(report.arrivalPredicateSha256, sha(readFileSync(arrival)));
assert.equal(sha(readFileSync(source)), sha(original), 'Shared verifier stayed unchanged');
assert.equal(report.partial, true); assert.equal(report.requestedScope, 'diagnostic');
assert.equal(report.selectedPassed, true); assert.equal(report.fullAcceptance, false);
assert.deepEqual(report.selectors, { worlds: null, states, demoOnly: false });
assert.deepEqual(report.worlds, worlds); assert.deepEqual(report.states, states);
assert.deepEqual(Object.keys(report.engines), [engine]); assert(report.engines[engine]);
assert.equal(report.error, undefined);
assert.deepEqual(report.rows.map(row => row.id), expected);
assert.deepEqual(report.observedCases, expected);
assert(report.rows.every(row => row.ok === true));
assert.equal(report.results.length, 33, 'Three changed states reached in every world');
assert.deepEqual(report.results.map(row => `${row.engine}/${row.world}/${row.state}`),
  worlds.flatMap(world => states.map(state => `${engine}/${world}/${state}`)));
for (const row of report.results) {
  const texts = row.pairs.map(pair => pair.text).join(' ');
  if (row.state === 'page') assert(texts.includes('lesson'), 'Measured lesson selection label: ' + row.world);
  if (row.state === 'deck-front') assert(texts.includes('Undo'), 'Measured Undo: ' + row.world);
  if (row.state === 'deck-back') assert(texts.includes('If the answer was new'), 'Measured coach: ' + row.world);
}
process.exitCode = result.status ?? 1;
