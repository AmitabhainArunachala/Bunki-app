/** Hfix-2c visual-state adapter. Reuse the existing pixel-based contrast sweep
 * unchanged, replacing only its navigation schedule with the two added states.
 * The generated runner and both source hashes are retained beside its evidence.
 * This is a targeted sweep (exit 3 when green), never app-wide acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

assert(['webkit', 'chromium'].includes(process.env.KAIRO_BROWSER), 'One engine at a time');
assert(!process.env.SWEEP_WORLDS, 'All eleven worlds are required');
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
replaceOnce('for (const state of STATE_NAMES)', 'for (const state of states)');
replaceOnce('/* ------------------------------------------------------------------ run */', `
STEPS.page = async (page) => {
  await page.route('**/__hfix-seed', route => route.fulfill({body:'<!doctype html><title>Fixture seed</title>',contentType:'text/html'}));
  await page.goto(origin + '/__hfix-seed');
  await page.evaluate(() => localStorage.setItem('kairo-corridor-v1', JSON.stringify({v:1,taken:[{t:'kanji',id:'生',label:'生',ts:1,started:1}],srs:{},srsPrefs:{newPerDay:20}})));
  await page.goto(origin + '/index.html?entry=shelf&ui=bi'); await ready(page);
  await page.locator('#tray').click(); await page.locator('#review-start').click(); await page.locator('#reveal').click();
  await page.locator('[data-kanji-readings]').waitFor(); await settle(page,700);
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
  scope: 'All eleven worlds; kanji review lesson-selection rendering, front Undo, and back coach/grade clearance. All selected-state contrast assertions retained.' }, null, 2));
const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', env: { ...process.env, SWEEP_STATES: 'page,deck-front,deck-back' } });
if (result.error) throw result.error;
const report = JSON.parse(readFileSync(join(out, `sweep-${process.env.KAIRO_BROWSER}.json`), 'utf8'));
assert.equal(report.results.length, 33, 'Three changed states reached in every world');
for (const row of report.results) {
  const texts = row.pairs.map(pair => pair.text).join(' ');
  if (row.state === 'page') assert(texts.includes('lesson'), 'Measured lesson selection label: ' + row.world);
  if (row.state === 'deck-front') assert(texts.includes('Undo'), 'Measured Undo: ' + row.world);
  if (row.state === 'deck-back') assert(texts.includes('If the answer was new'), 'Measured coach: ' + row.world);
}
process.exitCode = result.status ?? 1;
