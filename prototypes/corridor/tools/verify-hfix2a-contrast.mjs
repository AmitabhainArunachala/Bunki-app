/** Hfix-2a visual-state adapter. Reuse the existing pixel-based contrast sweep
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
STEPS.shelf = async (page) => {
  await page.goto(`${origin}/index.html?entry=shelf&ui=bi`); await ready(page);
  await page.evaluate(() => {
    for (const button of document.querySelectorAll('.primary-tab'))
      button.style.fontSize = `${parseFloat(getComputedStyle(button).fontSize) * 2}px`;
  });
  await page.waitForFunction(() => document.querySelector('#primary-tabs')?.dataset.wrapped === 'true');
  await eagerImages(page); await settle(page, 700);
};
STEPS.words = async (page) => {
  await page.goto(`${origin}/index.html?entry=shelf&ui=bi`); await ready(page);
  await page.evaluate(() => window.openWordWeb('橋', { type: 'word' })); await ready(page);
  await page.locator('.ww-c-r').click(); await page.locator('#mini').waitFor();
  await page.keyboard.press('Escape'); await page.locator('#mini').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.querySelectorAll('.ww-reading-choice').length === 4);
  await page.locator('.ww-reading-choice').last().scrollIntoViewIfNeeded(); await settle(page, 600);
};
/* ------------------------------------------------------------------ run */`);
const runner = join(out, 'hfix2a-contrast-runner.mjs'); writeFileSync(runner, adapted);
writeFileSync(join(out, 'adapter.json'), JSON.stringify({ original: source.href, originalSha256: sha(original),
  adapterSha256: sha(readFileSync(new URL(import.meta.url))), runnerSha256: sha(adapted),
  scope: 'All eleven worlds; 200% wrapped tab text and open Words homophones. All selected-state contrast assertions retained.' }, null, 2));
const result = spawnSync(process.execPath, [runner], { stdio: 'inherit', env: { ...process.env, SWEEP_STATES: 'shelf,words' } });
if (result.error) throw result.error;
const report = JSON.parse(readFileSync(join(out, `sweep-${process.env.KAIRO_BROWSER}.json`), 'utf8'));
assert.equal(report.results.length, 22, 'Both added states reached in every world');
for (const row of report.results) {
  const texts = row.pairs.map((pair) => pair.text);
  if (row.state === 'shelf') for (const label of ['Today', 'Read', 'Learn', 'Words', 'Me'])
    assert(texts.includes(label), `Measured enlarged tab: ${row.world}/${label}`);
  else for (const word of ['橋', '箸', '嘴', '端'])
    assert(texts.some((text) => text.includes(`${word} · はし`)), `Measured homophone: ${row.world}/${word}`);
}
process.exitCode = result.status ?? 1;
