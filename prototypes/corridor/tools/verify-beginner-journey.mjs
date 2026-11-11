/** An optional first reading, actual lookup/save, and retained study on a phone and desktop. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';
import { entryCloseSelector } from './sheet-navigation-support.mjs';
const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const evidence = join(resolveCorridorEvidence(), `beginner-${Date.now()}`);
mkdirSync(evidence, { recursive: true });
const site = resolveCorridorSite();
const host = await startStaticHost({ site, port: 0 });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const rows = [];
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: width === 390, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await context.route('**/*', route => new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort());
    try {
      const shelf = async () => {
        await page.goto(`${host.origin}/?entry=shelf&ui=bi`);
        await page.waitForFunction(() => document.body.dataset.ready === '1' && document.body.dataset.view === 'shelf');
      };
      await shelf();
      const initial = await readAppRecord(page);
      assert.equal(initial.taken.length, 0, 'The disposable newcomer starts with no saved cards');
      assert(await page.locator('.shelf-item').count() > 0, 'Ordinary reading remains available without onboarding');
      const start = page.getByRole('button', { name: 'Start with Japanese', exact: true });
      await start.waitFor({ timeout: 5000 });
      await start.click();
      const guide = page.locator('#beginner-guide');
      await guide.waitFor({ state: 'visible' });
      assert.match(await guide.innerText(), /tap|word/i, 'The guide explains lookup');
      assert.match(await guide.innerText(), /save/i, 'The guide explains saving');
      assert.match(await guide.innerText(), /review|study/i, 'The guide explains how to return to saved study');
      const afterGuide = await readAppRecord(page);
      assert.deepEqual(afterGuide.taken, initial.taken, 'Opening guidance never enrolls a word');
      assert.deepEqual(afterGuide.revlog, initial.revlog, 'Opening guidance never invents review results');
      await page.screenshot({ path: join(evidence, `${width}-guide.png`), fullPage: false });
      await page.locator('#beginner-read').click();
      await page.waitForFunction(() => document.body.dataset.view === 'reader' && document.querySelector('#reader .tok.content'));
      assert.match(await page.locator('#app main').innerText(), /静かな朝/, 'The first reading is the genuine shipped N5 morning article');
      const word = page.locator('#reader .tok.content[data-word="朝"]').first();
      await word.waitFor();
      // Use the real word controls; no application reducers or record writes from the test.
      for (let tap = 0; tap < 4 && !await page.locator('#mini-take').isVisible(); tap++) {
        const prior = await word.getAttribute('data-ladder-rung');
        await word.scrollIntoViewIfNeeded();
        await word.click();
        await page.waitForFunction(({ prior }) => {
          const n = document.querySelector('#reader .tok.content[data-word="朝"]');
          return !!document.getElementById('mini-take') || (n?.dataset.ladderRung && n.dataset.ladderRung !== prior);
        }, { prior });
      }
      await page.locator('#mini-take').waitFor({ state: 'visible' });
      assert((await page.locator('#mini .mini-gloss').innerText()).length > 0, 'Lookup supplies a real meaning');
      await page.locator('#mini-take').click();
      // SAVE (2026-11-11): Save asks where the word goes first; Review, the study queue, is picked
      await page.locator('#mini #mini-review').click();
      await waitForAppRecord(page, record => record.taken.some(row => row.t === 'word' && row.id === '朝'), { description: 'the learner-saved morning word' });
      const saved = await readAppRecord(page);
      assert.equal(saved.taken.length, 1, 'Only the word explicitly saved is enrolled');
      assert.deepEqual(saved.revlog, initial.revlog, 'Saving is not automatically graded');
      await page.locator('#mini .mini-word').click();
      await page.locator('#sheet').waitFor();
      const scroll = await page.evaluate(() => window.scrollY);
      await page.locator(await entryCloseSelector(page)).click();
      await page.locator('#sheet').waitFor({ state: 'detached' });
      assert.match(await page.locator('#app main').innerText(), /静かな朝/, 'The entry returns to the same reading');
      assert(Math.abs(await page.evaluate(() => window.scrollY) - scroll) < 3, 'Closing the entry preserves reading position');
      await shelf(); // Actual reload, same disposable installation.
      await waitForAppRecord(page, record => record.taken.some(row => row.id === '朝'), { description: 'saved card after reload' });
      await page.getByRole('button', { name: 'Start with Japanese', exact: true }).click();
      await page.locator('#beginner-study').click();
      await page.waitForFunction(() => ['dojo', 'tray'].includes(document.body.dataset.view));
      await page.locator('#review-start').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#review-start').isDisabled(), false, 'Saved word is available through the real review queue');
      await page.locator('#review-start').click();
      await page.waitForFunction(() => document.body.dataset.view === 'review');
      await page.locator('#reveal').click(); // A real review front hides the answer until the learner asks.
      await page.locator('.grade-row .grade.g-again').waitFor({ state: 'visible' });
      assert.match(await page.locator('#app main').innerText(), /朝/, 'The revealed review is the word actually saved');
      assert.deepEqual((await readAppRecord(page)).revlog, initial.revlog, 'Entering review does not fabricate a grade');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'No horizontal page overflow');
      await page.screenshot({ path: join(evidence, `${width}-review.png`), fullPage: false });
      assert.deepEqual(errors, [], 'No browser exceptions during the novice journey');
      rows.push({ width, pass: true });
    } catch (error) {
      await page.screenshot({ path: join(evidence, `${width}-failure.png`), fullPage: false }).catch(() => {});
      rows.push({ width, pass: false, error: error.stack, browserErrors: errors });
      throw error;
    } finally { await context.close(); }
  }
} finally {
  writeFileSync(join(evidence, 'result.json'), JSON.stringify(rows, null, 2));
  await browser.close();
  await host.close();
}
console.log('PASS optional beginner reading, save, source return, reload persistence, and actual study at 390 and 1280 widths');
console.log(evidence);
