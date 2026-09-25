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
 *   R4 front door: the navigation strip carries the entry and it opens the dialog;
 *      closing it returns focus to the 回廊 symbol that opened the navigation.
 *   R5 focused stage (読み探査 probe, body.zen): the page entry sits after the stage,
 *      opens the dialog, and the probe's reveal still takes a real click.
 *   R6 a room that failed to draw still carries the entry.
 *   R7 'My reports' opens the list; focus returns to the entry that opened it.
 *   R8 the field entry (?entry=field) carries the page entry.
 * Every case runs in Chromium and WebKit, at 1728×996 and 390×844.
 *
 * Claim boundary: the review more-row entry needs seeded due cards; the probe
 * covers the focused stage's layout. No backend is contacted (the dialog opens
 * locally; a static host has no report service — PLAN D19).
 *
 * Usage: node verify-report-entries.mjs   (KAIRO_SITE_DIR may pin a staged artifact)
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { chromium, webkit } from 'playwright-core';
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
const ENGINES = { chromium, webkit };
let browser = null;

const ready = (page) => page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
const railVisible = (page) => page.evaluate(() => {
  const rail = document.querySelector('#bunki-reports-root .br-rail');
  if (!rail) return false;
  const style = getComputedStyle(rail), box = rail.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
});
const reportOpen = (page) => page.evaluate(() => !!document.querySelector('#bunki-reports-root dialog.br-sheet[open]'));
async function closeReport(page) {
  await page.locator('#bunki-reports-root .br-close').click();
  await page.waitForFunction(() => !document.querySelector('#bunki-reports-root dialog.br-sheet[open]'), null, { timeout: 5_000 });
}
const focusedIs = (page, selector) => page.evaluate((sel) => !!document.activeElement?.matches(sel), selector);
const PAGE_ENTRY = '#app > .report-line-page [data-report-entry="open"]';
// The focused stage breathes (a slow continuous transform), so an actionability
// "stable box" wait never settles there. A finger does not wait for stillness:
// centre the control, prove the topmost element at that point IS the control
// (nothing covers it), and press those real coordinates.
async function fingerClick(page, selector) {
  const hit = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { found: true, x, y, uncovered: !!top && (top === el || el.contains(top)), top: top ? `${top.tagName}.${top.className}` : null };
  }, selector);
  if (hit.found && hit.uncovered) await page.mouse.click(hit.x, hit.y);
  return hit;
}
const PAGE_LIST = '#app > .report-line-page [data-report-entry="list"]';

try {
  // R0
  browser = await chromium.launch();
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

  await browser.close(); browser = null;
  for (const [engineName, engine] of Object.entries(ENGINES)) {
  browser = await engine.launch();
  for (const viewport of [{ width: 1728, height: 996 }, { width: 390, height: 844 }]) {
    const w = `${engineName} ${viewport.width}`;
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    // R2 shelf footer
    await page.goto(`${origin}/index.html?entry=shelf`); await ready(page);
    check(`R1 ${w}px shelf: no floating report rail is visible`, !(await railVisible(page)));
    const footer = page.locator(PAGE_ENTRY);
    check(`R2 ${w}px shelf: the page entry exists in the page's own flow`, (await footer.count()) === 1);
    if (await footer.count()) {
      await footer.click();
      check(`R2 ${w}px shelf: the page entry opens the report dialog`, await reportOpen(page));
      await closeReport(page);
      check(`R7 ${w}px shelf: closing returns focus to the entry that opened it`, await focusedIs(page, PAGE_ENTRY));
      await page.locator(PAGE_LIST).click();
      check(`R7 ${w}px shelf: 'My reports' opens the report list`, await reportOpen(page) &&
        await page.evaluate(() => /report/i.test(document.querySelector('#bunki-reports-root .br-body')?.innerText || '')));
      await closeReport(page);
      check(`R7 ${w}px shelf: closing the list returns focus to 'My reports'`, await focusedIs(page, PAGE_LIST));
    }
    const reading = page.locator('.shelf-item:not([data-recommendation]) .shelf-open').first();
    await reading.click();
    // the reader's text arrives asynchronously and re-renders once; wait for it to hold still
    const inReader = await page.waitForFunction(() => {
      const n = document.querySelectorAll('#reader .tok.content').length;
      const settled = n > 0 && window.__reportTokN === n; window.__reportTokN = n; return settled;
    }, null, { timeout: 15_000, polling: 250 }).then(() => true, () => false);
    check(`R2 ${w}px shelf: a reading door still opens its passage (host control clickable)`, inReader);
    check(`R1 ${w}px reader: no floating report rail is visible`, !(await railVisible(page)));

    // R3 word sheet
    const token = page.locator('#reader .tok.content').nth(3);
    if (await token.count()) {
      // a word's full sheet opens on a press-and-hold, as a finger does it (2.4 s)
      await token.scrollIntoViewIfNeeded();
      const box = await token.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down(); await page.waitForTimeout(2400); await page.mouse.up();
      const opened = await page.waitForSelector('#sheet', { timeout: 10_000 }).then(() => true, () => false);
      check(`R3 ${w}px sheet: a press-and-hold opens the word sheet`, opened);
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
    } else check(`R3 ${w}px sheet: a word token to open`, false, 'no #reader .tok.content');
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
      check(`R4 ${w}px front door: closing returns focus to the 回廊 symbol`, await focusedIs(page, '#ginga-symbol'));
    }

    // R8 the field entry (?entry=field) is a front door too; it carries the page entry
    await page.goto(`${origin}/index.html?entry=field`); await ready(page);
    const onField = await page.evaluate(() => !!document.querySelector('#field'));
    check(`R8 ${w}px field entry: the field is up`, onField);
    const fieldEntry = page.locator(PAGE_ENTRY);
    check(`R8 ${w}px field entry: the page entry exists`, (await fieldEntry.count()) === 1);
    if (await fieldEntry.count()) {
      await fieldEntry.scrollIntoViewIfNeeded(); await fieldEntry.click();
      check(`R8 ${w}px field entry: the entry opens the report dialog`, await reportOpen(page));
      await closeReport(page);
    }

    // R5 the focused stage: the 読み探査 probe (body.zen), reached as a learner does
    await page.goto(origin); await ready(page);
    await page.locator('#ginga-symbol').click();
    await page.locator('.nav-dojo').click();
    await page.locator('.focus-mode', { hasText: '読み探査' }).click();
    await page.locator('.focus-start').click();
    const inProbe = await page.waitForSelector('.review-front', { timeout: 20_000 }).then(() => true, () => false);
    const zen = await page.evaluate(() => document.body.classList.contains('zen'));
    check(`R5 ${w}px probe: the focused stage is up (body.zen)`, inProbe && zen);
    check(`R1 ${w}px probe: no floating report rail is visible`, !(await railVisible(page)));
    const probeEntry = page.locator(PAGE_ENTRY);
    check(`R5 ${w}px probe: the page entry exists after the stage`, (await probeEntry.count()) === 1);
    if (await probeEntry.count()) {
      const hit = await fingerClick(page, PAGE_ENTRY);
      check(`R5 ${w}px probe: nothing covers the entry`, hit.uncovered, JSON.stringify(hit));
      check(`R5 ${w}px probe: the entry opens the report dialog`, await reportOpen(page));
      if (await reportOpen(page)) await closeReport(page);
    }
    const revealHit = await fingerClick(page, '#probe-reveal');
    const revealed = revealHit.found && revealHit.uncovered;
    check(`R5 ${w}px probe: the stage's own reveal still takes a real click`, revealed &&
      await page.waitForSelector('.probe-meta', { timeout: 5_000 }).then(() => true, () => false));
    await context.close();

    // R6 a room that failed to draw keeps its entry (fault injected by this harness only)
    const faultContext = await browser.newContext({ viewport });
    await faultContext.route('**/assessment-view.mjs', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace('    render(main) {\n', "    render(main) {\n      throw new Error('injected room fault');\n");
      await route.fulfill({ response, body });
    });
    const faultPage = await faultContext.newPage();
    await faultPage.goto(`${origin}/index.html?entry=shelf`); await ready(faultPage);
    await faultPage.locator('#chrome-dojo').click();
    await faultPage.locator('button[data-study-door="mock"]').click();
    const errored = await faultPage.waitForSelector('[data-room-error]', { timeout: 10_000 }).then(() => true, () => false);
    check(`R6 ${w}px failed room: the error state is shown`, errored);
    check(`R6 ${w}px failed room: the page entry is still there`, (await faultPage.locator(PAGE_ENTRY).count()) === 1);
    await faultContext.close();
  }
  await browser.close(); browser = null;
  }
} finally {
  writeFileSync(resolve(EVIDENCE, 'report-entries.json'), JSON.stringify({ origin, results }, null, 2) + '\n');
  await browser?.close();
  await host.close();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed · evidence ${EVIDENCE}`);
process.exit(failed.length ? 1 : 0);
