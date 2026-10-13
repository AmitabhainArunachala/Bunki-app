/** The bug button on the published (service-less) app files a prefilled GitHub issue.
 *
 * Runs the built site with no report service, as GitHub Pages serves it: the
 * client's /api/config probe gets the host's own 404. github.com is stubbed so no
 * real issue is ever opened. Checks, per engine:
 *   1. the sheet offers "Send to GitHub" and opens one prefilled new-issue page
 *      in the same tap (title, label, marker, words, version, screen, report ID);
 *   2. the saved copy names the same report and is marked "Opened on GitHub";
 *   3. very long words are shortened to fit GitHub's address limit;
 *   4. when the browser blocks the window, the report is saved with a working
 *      "Send to GitHub" link (the path for reports saved by earlier versions);
 *   5. "Copy report text" copies the same issue text (Chromium only);
 *   6. no console errors.
 */
/* global document, window, indexedDB, navigator */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { URL } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const ISSUE = 'https://github.com/AmitabhainArunachala/Bunki-app/issues/new';
const out = resolveCorridorEvidence();
mkdirSync(out, { recursive: true });
const host = await startCorridorDev(0);
const version = JSON.parse(readFileSync(new URL('../../../release.json', import.meta.url))).version;
const engines = process.env.KAIRO_BROWSER === 'chromium' ? { chromium } : { chromium, webkit };
const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
};

async function openSheet(page, beforeProbe) {
  await page.goto(`${host.origin}/index.html?entry=shelf`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
  await page.locator('#bunki-report-bug').click();
  await page.locator('#br-actual').waitFor();
  if (beforeProbe) await beforeProbe();
  // The sheet settles once the service probe has answered with the host's 404.
  await page.waitForFunction(() => document.querySelector('#br-form .br-primary')?.textContent === 'Send to GitHub', null, { timeout: 15_000 });
}
const savedRows = (page) =>
  page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('bunki-maintenance-reports-v1');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const read = request.result.transaction('records').objectStore('records').getAll();
      read.onsuccess = () => { resolve(read.result); request.result.close(); };
      read.onerror = () => reject(read.error);
    };
  }));
const issueOf = (address) => {
  const url = new URL(address);
  return { base: `${url.origin}${url.pathname}`, title: url.searchParams.get('title') || '', body: url.searchParams.get('body') || '', labels: url.searchParams.get('labels'), length: address.length };
};

try {
  for (const [engine, browserType] of Object.entries(engines)) {
    console.log(`\n— ${engine}`);
    const browser = await browserType.launch({ ...(engine === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    try {
      const fresh = async ({ blockWindows = false, probeDelayMs = 0 } = {}) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
        if (probeDelayMs) await context.route(`${host.origin}/api/config`, async (route) => {
          await new Promise((resolve) => setTimeout(resolve, probeDelayMs));
          await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        });
        await context.route('https://github.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title><p>GitHub stub</p>' }));
        if (engine === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: host.origin });
        if (blockWindows) await context.addInitScript(() => { window.open = () => null; });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        // The service probe's own 404 is the published host's real answer, not a fault.
        page.on('console', (message) => {
          if (message.type() === 'error' && !/(\/api\/config|favicon\.ico)$/.test(message.location()?.url || '')) errors.push(message.text());
        });
        return { context, page, errors };
      };

      // 1–2 · one tap opens the prefilled issue and saves the same report
      {
        const { context, page, errors } = await fresh();
        await openSheet(page);
        const note = await page.locator('#br-form > .br-note').last().textContent();
        check(`${engine} · the sheet says GitHub issues are public before anything is sent`, /public/.test(note), note);
        const words = 'The reader popup covers the word 天気 after I tap it.\nSecond line with detail.';
        await page.locator('#br-actual').fill(words);
        await page.locator('#br-expected').fill('The popup should sit below the word.');
        const popupPromise = context.waitForEvent('page');
        await page.locator('#br-form .br-primary').click();
        const popup = await popupPromise;
        await popup.waitForLoadState('domcontentloaded').catch(() => {});
        const issue = issueOf(popup.url());
        await page.waitForFunction(() => document.querySelector('#br-title')?.textContent === 'Your report');
        const rows = await savedRows(page);
        const row = rows[0];
        check(`${engine} · the tap opens GitHub's new-issue page for this repository`, issue.base === ISSUE, issue.base);
        check(`${engine} · the issue is titled from the first line and carries the fixer label`,
          issue.title === '[KAIRO] The reader popup covers the word 天気 after I tap it.' && issue.labels === 'kairo-report', `${issue.title} · ${issue.labels}`);
        check(`${engine} · the body holds the marker, the words, the expectation, the version and the screen`,
          issue.body.startsWith('<!-- kairo-report v1 -->') && issue.body.includes(words) &&
            issue.body.includes('The popup should sit below the word.') && issue.body.includes(`- App: KAIRO ${version}`) &&
            issue.body.includes('- Screen: `corridor/shelf`') && issue.body.includes('- Category: bug'),
          `${issue.body.length} characters`);
        check(`${engine} · one saved report, named in the issue and marked as opened on GitHub`,
          rows.length === 1 && issue.body.includes(`- Report ID on the device: \`${row?.id}\``) && !!row?.github_opened_at,
          `${rows.length} row(s) · ${row?.id}`);
        const status = await page.locator('.br-body h3').first().textContent();
        const again = await page.locator('a.br-link[data-br="github"]').getAttribute('href');
        check(`${engine} · the saved report says so and can be sent again to the same issue text`,
          status === 'Opened on GitHub' && issueOf(again).body === issue.body, status);
        if (engine === 'chromium') {
          await page.locator('[data-br="copy"]').click();
          await page.waitForFunction(() => /^Copied\./.test(document.querySelector('.br-notice')?.textContent || ''));
          const copied = await page.evaluate(() => navigator.clipboard.readText());
          check('chromium · Copy report text copies the same title and body', copied === `${issue.title}\n\n${issue.body}\n`, `${copied.length} characters`);
        }
        await page.screenshot({ path: join(out, `${engine}-sent.png`) });
        check(`${engine} · no console errors (sent)`, errors.length === 0, errors.join(' | '));
        await context.close();
      }

      // 3 · long words are shortened to fit, with the full text kept on the device
      {
        const { context, page, errors } = await fresh();
        await openSheet(page);
        const long = '長い説明の文章です。'.repeat(500);
        await page.locator('#br-actual').fill(long);
        const popupPromise = context.waitForEvent('page');
        await page.locator('#br-form .br-primary').click();
        const issue = issueOf((await popupPromise).url());
        await page.waitForFunction(() => document.querySelector('#br-title')?.textContent === 'Your report');
        const [row] = await savedRows(page);
        check(`${engine} · a long report fits GitHub's address limit and says it was shortened`,
          issue.length <= 7000 && issue.body.includes('Shortened to fit') && issue.body.includes('長い説明の文章です。'),
          `${issue.length} characters in the address`);
        check(`${engine} · the device keeps the full words`, row?.report.user_words === long, `${Array.from(row?.report.user_words || '').length} characters saved`);
        check(`${engine} · no console errors (long)`, errors.length === 0, errors.join(' | '));
        await context.close();
      }

      // 4 · a blocked window still saves, and the link sends it (also covers older saved reports)
      {
        // The service probe answers late here: until it confirms there is no service,
        // the sheet must not offer GitHub (a real service may still answer).
        const { context, page, errors } = await fresh({ blockWindows: true, probeDelayMs: 2500 });
        let pendingLabel = '';
        await openSheet(page, async () => { pendingLabel = await page.locator('#br-form .br-primary').textContent(); });
        check(`${engine} · GitHub is offered only after the probe confirms there is no service`,
          !!pendingLabel && pendingLabel !== 'Send to GitHub', `while pending: ${pendingLabel}`);
        await page.locator('#br-actual').fill('Saved while the window was blocked.');
        await page.locator('#br-form .br-primary').click();
        await page.waitForFunction(() => document.querySelector('#br-title')?.textContent === 'Your report');
        const note = await page.locator('.br-notice').textContent();
        const status = await page.locator('.br-body h3').first().textContent();
        check(`${engine} · a blocked window leaves the report saved with a clear next step`,
          status === 'Saved on this device' && /Send to GitHub/.test(note), `${status} · ${note}`);
        const popupPromise = context.waitForEvent('page');
        await page.locator('a.br-link[data-br="github"]').click();
        const issue = issueOf((await popupPromise).url());
        await page.waitForFunction(() => document.querySelector('.br-body h3')?.textContent === 'Opened on GitHub');
        const [row] = await savedRows(page);
        check(`${engine} · the saved report's link opens the prefilled issue and records it`,
          issue.base === ISSUE && issue.body.includes('Saved while the window was blocked.') && !!row?.github_opened_at,
          issue.title);
        await page.locator('[data-br="list"]').first().click();
        await page.locator('.br-report-list').waitFor();
        const listed = await page.locator('.br-report-list .br-status').first().textContent();
        check(`${engine} · My reports lists it as opened on GitHub`, listed === 'Opened on GitHub', listed);
        check(`${engine} · no console errors (blocked window)`, errors.length === 0, errors.join(' | '));
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await host.close?.();
}

const failed = checks.filter((item) => !item.pass);
writeFileSync(join(out, 'verification-report.json'), `${JSON.stringify({ suite: 'report-github', version, checks }, null, 2)}\n`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
