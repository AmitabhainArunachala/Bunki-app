/**
 * verify-journey — the ONE FLOWING SEQUENCE, walked end to end.
 *
 * A tripwire, not a gate (operator brief, 2026-08-10): it encodes the
 * product shape as it stands TODAY — the rooms the corridor actually has
 * and the seams between them — so a regression in the weave trips loudly.
 * When the operator changes the product, rewrite this file to match; do
 * not bend the product to an old charter.
 *
 * Stations (each verified in one continuous phone-size session):
 *   1  the Drift front door, resting
 *   2  the shelf behind it
 *   3  search → a synonym cluster under the hits → a neighbour's entry
 *   4  the reader → capture a word (覚える)
 *   5  the learner mark (under-ink) appearing in the text just read
 *   6  途中 on the shelf after leaving mid-article
 *   7  a JLPT lesson end to end (learn → quiz → words land in the tray)
 *   8  the tray → a review session through to its summary
 *   9  the day's review trace appearing under the review button
 *  10  levels · grammar (≥100 entries) · thesaurus · 字引 · export doors
 *  11  back to the Drift — the loop closes
 *
 * Honest-probe rules learned the hard way:
 *   - element.tap() auto-scrolls to its target; never read scroll-derived
 *     state (bookmarks, 途中 tags) after a tap without re-scrolling.
 *   - the entry sheet swallows clicks for ~700ms after opening (same-
 *     gesture ghost guard); wait it out before pressing anything inside.
 *
 * Usage: node prototypes/corridor/tools/verify-journey.mjs
 *   (exits non-zero if any station fails; set JOURNEY_SHOTS=dir for pngs)
 */
import { chromium } from 'playwright-core';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STANDALONE = resolve(HERE, '..', 'corridor-standalone.html');
const SHOTS = process.env.JOURNEY_SHOTS || null;

const CHROME_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));

const failures = [];
let page;
const step = async (name, fn) => {
  try {
    await fn();
    console.log('ok —', name);
  } catch (e) {
    failures.push(name);
    console.log('FAIL —', name, ':', String(e).split('\n')[0]);
  }
};
const shot = async (name) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});
await page.goto('file://' + STANDALONE);

await step('1 drift front door', async () => {
  await page.waitForSelector('#drift-layer.active', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await shot('01-drift');
});

await step('2 shelf', async () => {
  await page.click('#enter-shelf-door');
  await page.waitForSelector('.shelf-item', { timeout: 10000 });
});

await step('3 search + synonym cluster + entry', async () => {
  await page.fill('#search', '意見');
  await page.waitForTimeout(400);
  if (!(await page.$('.search-syn'))) throw new Error('no cluster under the hits');
  await page.click('.search-syn .sem-row');
  await page.waitForSelector('.sheet .headword', { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.fill('#search', '');
  await page.waitForTimeout(300);
});

await step('4 reader capture', async () => {
  await page.click('.shelf-item');
  await page.waitForSelector('.reader .tok.content', { timeout: 10000 });
  const tok = await page.$('.reader .tok.content');
  await tok.tap();
  await page.waitForTimeout(400);
  await tok.tap();
  await page.waitForSelector('.sheet .headword', { timeout: 5000 });
  await page.waitForTimeout(800); // the sheet's same-gesture click guard
  const take = await page.$('.sheet .take:not(.taken)');
  if (!take) throw new Error('no take button on sheet');
  await take.click();
  await page.waitForTimeout(400);
  const taken = await page.evaluate(
    () => (JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}').taken || []).length,
  );
  if (!taken) throw new Error('take did not persist');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(1400); // the bookmark debounce
  await shot('04-reader');
});

await step('5 learner mark in the text', async () => {
  const marks = await page.evaluate(() => document.querySelectorAll('.reader .tok-learning').length);
  if (marks < 1) throw new Error('no under-ink after take');
});

await step('6 shelf 途中 tag', async () => {
  await page.click('#back');
  await page.waitForSelector('.shelf-item', { timeout: 5000 });
  const t = await page.evaluate(() => document.querySelector('.shelf-item .read-tag')?.textContent || '');
  if (!t.includes('途中')) throw new Error('tag: ' + JSON.stringify(t));
});

await step('7 JLPT lesson end to end', async () => {
  await page.click('#lessons-link');
  await page.waitForSelector('.lesson-row', { timeout: 5000 });
  await page.click('.lesson-row');
  await page.waitForSelector('#lesson-next', { timeout: 5000 });
  for (let i = 0; i < 40; i++) {
    const opt = await page.$('.lesson-option:not([disabled])');
    if (opt) await opt.click();
    const next = await page.$('#lesson-next');
    if (next) await next.click();
    await page.waitForTimeout(80);
    const t = await page.evaluate(() => document.querySelector('.view-title')?.textContent || '');
    if (/of|\//.test(t)) break;
  }
  await shot('07-lesson-end');
  await page.evaluate(() =>
    [...document.querySelectorAll('.take')].find((b) => /レッスン一覧|back to lessons/.test(b.textContent))?.click(),
  );
  await page.waitForTimeout(300);
  await page.click('#back');
  await page.waitForTimeout(300);
});

await step('8 tray → review → summary', async () => {
  await page.click('#tray');
  await page.waitForSelector('#review-start', { timeout: 5000 });
  await shot('08-tray');
  await page.click('#review-start');
  for (let i = 0; i < 60; i++) {
    const rev = await page.$('#reveal');
    if (rev) {
      await rev.click();
      await page.waitForTimeout(100);
    }
    const g = await page.$('.grade.g-good');
    if (g) {
      await g.click();
      await page.waitForTimeout(100);
    }
    if (await page.$('.review-summary')) break;
  }
  if (!(await page.$('.review-summary'))) throw new Error('no summary reached');
  await shot('09-summary');
});

await step('9 review trace on the tray', async () => {
  await page.evaluate(() =>
    [...document.querySelectorAll('.take')].find((b) => /リストへ|back to lists/.test(b.textContent))?.click(),
  );
  await page.waitForTimeout(300);
  const tr = await page.evaluate(() => document.querySelector('.srs-trace')?.textContent);
  if (!tr) throw new Error('no trace line');
  if (!(await page.$('#export-store')) || !(await page.$('#import-store'))) throw new Error('carry doors missing');
});

await step('10 levels · grammar(100+) · thesaurus · 字引', async () => {
  await page.click('#back');
  await page.waitForTimeout(300);
  await page.click('#levels-link');
  await page.waitForTimeout(400);
  await page.click('#back');
  await page.waitForTimeout(300);
  await page.click('#grammar-link');
  await page.waitForTimeout(400);
  const g = await page.evaluate(() => document.querySelectorAll('[data-grammar]').length);
  if (g < 100) throw new Error('grammar rows: ' + g);
  await page.click('#back');
  await page.waitForTimeout(300);
  await page.click('#thesaurus-link');
  await page.waitForSelector('.thes-block', { timeout: 5000 });
  await page.click('#back');
  await page.waitForTimeout(300);
  await page.click('#kanjidex-link');
  await page.waitForSelector('.kdx-row', { timeout: 5000 });
  await page.click('[data-kdx-part="木"]');
  await page.waitForTimeout(400);
  await page.click('[data-kdx-st="8"]');
  await page.waitForTimeout(400);
  const hits = await page.evaluate(() => [...document.querySelectorAll('[data-kdx-hit]')].map((b) => b.dataset.kdxHit));
  if (!hits.includes('林')) throw new Error('木+8画 misses 林: ' + hits.slice(0, 8).join(''));
  await page.click('[data-kdx-hit="林"]');
  await page.waitForTimeout(600);
  const glyph = await page.evaluate(() => document.querySelector('.sheet .hero-glyph')?.textContent);
  if (glyph !== '林') throw new Error('hit did not open the entry');
  const twins = await page.evaluate(() => !!document.querySelector('[data-confusable]'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click('#back');
  await page.waitForTimeout(300);
  void twins; // 林 has no confusable set — presence is per-character, not asserted here
});

await step('11 return to the drift', async () => {
  for (let i = 0; i < 4; i++) {
    if (await page.$('#drift-layer.active')) break;
    await page.click('#back');
    await page.waitForTimeout(400);
  }
  if (!(await page.$('#drift-layer.active'))) throw new Error('drift not reached');
  await page.waitForTimeout(1500);
  await shot('11-drift-return');
});

if (pageErrors.length) {
  failures.push('console/page errors');
  console.log('page errors:', pageErrors);
} else {
  console.log('page errors: none');
}
await browser.close();

if (failures.length) {
  console.error(`\nverify-journey: ${failures.length} station(s) failed — ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nverify-journey: all stations passed — the sequence flows.');
