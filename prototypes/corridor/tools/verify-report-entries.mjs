/**
 * Report entries live in the page's own flow and never cover a learner's control.
 *
 * The floating report rail (fixed, max z-index, re-parented into open dialogs)
 * intercepted taps on Undo, まだ/思い出した, reveal and sheet fold-heads across four
 * suites (2026-09-25). The app now mounts the report client with rail:false and
 * offers in-flow entries. Each case below proves both halves: the entry opens the
 * report dialog, AND the host control beside it still takes a real click.
 *
 *   R0 identity: the served build names the commit under test (same rule as doors).
 *   R1 no floating rail is visible anywhere in the app (shelf, reader, sheet, door).
 *   R2 shelf: the footer entry opens the report dialog; closing returns; a shelf
 *      reading door still opens its passage.
 *   R3 word sheet: the entry at the end of the sheet opens the dialog; the sheet's
 *      own back control still closes the sheet.
 *   R4 front door: the navigation strip carries the entry and it opens the dialog.
 *
 * Claim boundary: the focused review stage (its more-row entry) needs seeded due
 * cards and is exercised by the review suites, not here.
 *
 * Usage: node verify-report-entries.mjs   (KAIRO_SITE_DIR may pin a staged artifact)
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { chromium } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');

const SITE = resolveCorridorSite();
const EVIDENCE = resolveCorridorEvidence();
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
};
const host = await startStaticHost({ site: SITE, port: 0 });
const origin = host.origin;
const browser = await chromium.launch();

const ready = (page) => page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
const railVisible = (page) => page.evaluate(() => {
  const rail = document.querySelector('#bunki-reports-root .br-rail');
  if (!rail) return false;
  const style = getComputedStyle(rail), box = rail.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
});
const reportOpen = (page) => page.evaluate(() => !!document.querySelector('#bunki-reports-root dialog.br-sheet[open]'));
async function closeReport(page) {
  await page.locator('#bunki-reports-root [data-br="close"]').click();
  await page.waitForFunction(() => !document.querySelector('#bunki-reports-root dialog.br-sheet[open]'), null, { timeout: 5_000 });
}

try {
  // R0
  {
    const context = await browser.newContext(); const page = await context.newPage();
    const identity = await (await page.request.get(`${origin}/build-identity.json`)).json();
    let head = null; try { head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* outside a checkout */ }
    const expected = process.env.KAIRO_EXPECT_GITSHA || head;
    check('R0 served gitSha is the expected commit, clean', identity.gitSha === expected && identity.sourceDirty === false,
      `served=${identity.gitSha} expected=${expected} dirty=${identity.sourceDirty}`);
    const manifest = new Map(identity.files.map((row) => [row.path, row.sha256]));
    for (const path of ['corridor.js', 'maintenance/report-client.js']) {
      const bytes = Buffer.from(await (await page.request.get(`${origin}/${path}`)).body());
      check(`R0 served ${path} matches its manifest entry`, createHash('sha256').update(bytes).digest('hex') === manifest.get(path));
    }
    await context.close();
    if (results.some((r) => !r.pass)) throw new Error('identity failed');
  }

  for (const viewport of [{ width: 1728, height: 996 }, { width: 390, height: 844 }]) {
    const w = viewport.width;
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    // R2 shelf footer
    await page.goto(`${origin}/index.html?entry=shelf`); await ready(page);
    check(`R1 ${w}px shelf: no floating report rail is visible`, !(await railVisible(page)));
    const footer = page.locator('#app main > .report-line [data-report-entry="open"]');
    check(`R2 ${w}px shelf: the footer entry exists in main's flow`, (await footer.count()) === 1);
    if (await footer.count()) {
      await footer.click();
      check(`R2 ${w}px shelf: the footer entry opens the report dialog`, await reportOpen(page));
      await closeReport(page);
    }
    const reading = page.locator('.shelf-item .shelf-open').first();
    await reading.click();
    await page.waitForFunction(() => document.querySelector('#app')?.querySelector('.reader, .tok'), null, { timeout: 10_000 }).catch(() => {});
    const inReader = await page.evaluate(() => !!document.querySelector('.reader .tok, .reader'));
    check(`R2 ${w}px shelf: a reading door still opens its passage (host control clickable)`, inReader);
    check(`R1 ${w}px reader: no floating report rail is visible`, !(await railVisible(page)));

    // R3 word sheet
    const token = page.locator('.reader button.tok').first();
    if (await token.count()) {
      await token.click();
      await page.waitForSelector('#sheet', { timeout: 10_000 }).catch(() => {});
      const sheetEntry = page.locator('#sheet .report-line [data-report-entry="open"]');
      check(`R1 ${w}px sheet: no floating report rail is visible`, !(await railVisible(page)));
      check(`R3 ${w}px sheet: the entry sits at the end of the sheet`, (await sheetEntry.count()) === 1);
      if (await sheetEntry.count()) {
        await sheetEntry.scrollIntoViewIfNeeded();
        await sheetEntry.click();
        check(`R3 ${w}px sheet: the entry opens the report dialog`, await reportOpen(page));
        await closeReport(page);
      }
      await page.locator('#sheet-back').click();
      const sheetGone = await page.waitForFunction(() => !document.querySelector('#sheet'), null, { timeout: 5_000 }).then(() => true, () => false);
      check(`R3 ${w}px sheet: its own back control still closes the sheet`, sheetGone);
    } else check(`R3 ${w}px sheet: a word token to open`, false, 'no .reader button.tok');
    await page.screenshot({ path: resolve(EVIDENCE, `report-entries-${w}.png`), fullPage: false });

    // R4 front door navigation strip
    await page.goto(origin); await ready(page);
    check(`R1 ${w}px front door: no floating report rail is visible`, !(await railVisible(page)));
    await page.locator('#ginga-symbol').click();
    const navEntry = page.locator('button.nav-report[data-report-entry="open"]');
    check(`R4 ${w}px front door: the navigation strip carries the entry`, (await navEntry.count()) === 1);
    if (await navEntry.count()) {
      await navEntry.click();
      check(`R4 ${w}px front door: the entry opens the report dialog`, await reportOpen(page));
      await closeReport(page);
    }
    await context.close();
  }
} finally {
  writeFileSync(resolve(EVIDENCE, 'report-entries.json'), JSON.stringify({ origin, results }, null, 2) + '\n');
  await browser.close();
  await host.close();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed · evidence ${EVIDENCE}`);
process.exit(failed.length ? 1 : 0);
