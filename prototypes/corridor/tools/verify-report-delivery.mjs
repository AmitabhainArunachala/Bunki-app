/** Problem reports reach GitHub, through the report relay or, on a device not set
 * up for it, through a prefilled GitHub issue.
 *
 * Runs the built site as GitHub Pages serves it: with no service of its own, the
 * client's /api/config probe gets the host's 404. github.com is stubbed so no real
 * issue is ever opened, and the relay runs locally against a mock GitHub API.
 * Checks, per engine, for the prefilled-issue fallback:
 *   1. the sheet offers "Send to GitHub" and opens one prefilled new-issue page
 *      in the same tap (title, label, marker, words, version, screen, report ID);
 *   2. the saved copy names the same report and is marked "Opened on GitHub";
 *   3. very long words are shortened to fit GitHub's address limit;
 *   4. when the browser blocks the window, the report is saved with a working
 *      "Send to GitHub" link (the path for reports saved by earlier versions);
 *   5. "Copy report text" copies the same issue text (Chromium only);
 *   6. no console errors.
 * and for the relay (services/report-relay):
 *   7. the setup link, pasted in Settings (as in a home-screen app) or opened in
 *      the browser, sets up the device and leaves the address;
 *   8. a report saved before setup is filed automatically;
 *   9. a new report with a screenshot becomes a labelled issue, linked in the app,
 *      with the screenshot served by the relay;
 *  10. the fixer's comment and status appear in the app, and a reply from the app
 *      becomes an issue comment.
 */
/* global document, window, indexedDB, navigator, location, fetch */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import process from 'node:process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { URL } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { memoryKv, PIXEL_PNG, startMockGithub, startRelay } from '../../../services/report-relay/test-support.mjs';

const ISSUE = 'https://github.com/AmitabhainArunachala/Bunki-app/issues/new';
const out = resolveCorridorEvidence();
mkdirSync(out, { recursive: true });
const host = await startCorridorDev(0);
const version = JSON.parse(readFileSync(new URL('../../../release.json', import.meta.url))).version;
const RELAY_KEY = 'relay-test-key-0123456789';
const setupLink = () => `${host.origin}/index.html?report-relay=${relay.origin}&report-key=${RELAY_KEY}`;
const github = await startMockGithub();
const relay = await startRelay({ REPORTS: memoryKv(), GITHUB_TOKEN: 'test-github-token', REPORT_KEY: RELAY_KEY, GITHUB_REPO: 'AmitabhainArunachala/Bunki-app', GITHUB_API: github.origin, ALLOW_LOOPBACK: '1' });
const waitFor = async (predicate, timeout = 20_000) => {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return true;
};
const engines = process.env.KAIRO_BROWSER === 'chromium' ? { chromium } : { chromium, webkit };
const checks = [];
// In GitHub Actions a failed check is also an annotation, so the failure is
// readable from the check run without downloading the job log.
const annotate = (text) => {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  const escaped = text.slice(0, 900).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  console.log(`::error title=report-delivery check failed::${escaped}`);
};
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
  if (!pass) annotate(`${name}${detail ? ` — ${detail}` : ''}`);
};
// A scenario that throws is recorded as a failed check, and the next one still runs.
const scenario = async (name, body) => {
  try {
    await body();
  } catch (error) {
    check(`${name} ran to completion`, false, String(error?.message || error).split('\n').slice(0, 3).join(' '));
  }
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
      await scenario(`${engine} · prefilled issue`, async () => {
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
      });

      // 3 · long words are shortened to fit, with the full text kept on the device
      await scenario(`${engine} · long report`, async () => {
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
      });

      // 4 · a blocked window still saves, and the link sends it (also covers older saved reports)
      await scenario(`${engine} · blocked window`, async () => {
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
      });
      // 5 · the relay: one setup link, then reports go straight to GitHub
      await scenario(`${engine} · relay`, async () => {
        github.state.issues.length = 0;
        github.state.comments.length = 0;
        const { context, page, errors } = await fresh({ blockWindows: true });
        // A report saved before the relay was set up, as on a phone running 1.0.x.
        await openSheet(page);
        await page.locator('#br-actual').fill('Saved before the relay was set up.');
        await page.locator('#br-form .br-primary').click();
        await page.waitForFunction(() => document.querySelector('#br-title')?.textContent === 'Your report');
        // A home-screen app keeps its own storage, so the link is pasted in Settings.
        await page.locator('.br-sheet .br-close').click();
        await page.locator('#tab-me').click();
        await page.locator('#me-settings').click();
        await page.waitForFunction(() => document.documentElement.dataset.room === 'settings');
        const before = await page.locator('#settings-reports-status').textContent();
        await page.locator('#settings-report-link').fill('https://example.com/not-a-setup-link');
        await page.locator('#settings-report-save').click();
        const refused = await page.locator('#settings-report-note').textContent();
        check(`${engine} · Settings refuses text that is not a setup link`, /not a report setup link/.test(refused) && !(await page.evaluate(() => localStorage.getItem('kairo-report-relay-v1'))), refused);
        await page.locator('#settings-report-link').fill(setupLink());
        await Promise.all([page.waitForEvent('load'), page.locator('#settings-report-save').click()]);
        await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kairo-report-relay-v1') || 'null')?.url);
        check(`${engine} · pasting the setup link in Settings sets up this device`,
          /Not set up/.test(before) && stored === `${relay.origin}/k/${RELAY_KEY}`, `${before} → ${stored}`);
        await waitFor(() => github.state.issues.length === 1);
        check(`${engine} · the report saved before setup is filed automatically`,
          github.state.issues.length === 1 && github.state.issues[0].body.includes('Saved before the relay was set up.'), github.state.issues[0]?.title || 'no issue');

        await page.locator('#bunki-report-bug').click();
        await page.locator('#br-actual').waitFor();
        const ready = await page.waitForFunction(() => document.querySelector('#br-form .br-primary')?.textContent === 'Send report', null, { timeout: 15_000 }).then(() => true, () => false);
        check(`${engine} · with the relay set up, the sheet sends reports itself`, ready, await page.locator('#br-form .br-primary').textContent());
        await page.locator('#br-actual').fill('The tutor reply is cut off.');
        await page.locator('#br-files').setInputFiles({ name: 'screen.png', mimeType: 'image/png', buffer: PIXEL_PNG });
        await page.locator('.br-attachments figure').waitFor();
        await page.locator('#br-form .br-primary').click();
        const received = await page.waitForFunction(() => document.querySelector('.br-body h3')?.textContent === 'Received', null, { timeout: 20_000 }).then(() => true, () => false);
        const filed = github.state.issues[1];
        const link = received ? await page.locator('.br-body > .br-note a').first().getAttribute('href') : null;
        check(`${engine} · the report becomes a labelled issue, linked from the app`,
          received && !!filed && filed.labels.some((label) => label.name === 'kairo-report') && filed.body.includes('The tutor reply is cut off.') &&
            filed.body.includes(`- App: KAIRO ${version}`) && link === filed.html_url,
          `${filed?.html_url} · app link ${link}`);
        const shot = /\((http:\/\/127\.0\.0\.1:\d+\/v1\/shots\/shot_[a-f0-9]{32})\)/.exec(filed?.body || '')?.[1];
        const bytes = shot ? Buffer.from(await (await fetch(shot)).arrayBuffer()) : null;
        check(`${engine} · the screenshot is in the issue, served by the relay`, !!bytes && bytes.equals(PIXEL_PNG), shot || 'no screenshot link');

        github.comment(2, 'Found it: the reply box clips long answers. The fix is in review.');
        github.label(2, 'fixer:pr-open');
        await page.locator('[data-br="refresh"]').click();
        const updated = await page.waitForFunction(() => document.querySelector('.br-body h3')?.textContent === 'Ready for review', null, { timeout: 20_000 }).then(() => true, () => false);
        const thread = updated ? await page.locator('.br-thread').textContent() : '';
        check(`${engine} · the fixer's status and comment appear on the report`, updated && thread.includes('On GitHub') && thread.includes('The fix is in review.'), thread.slice(0, 160));
        await page.locator('#br-follow').fill('It also happens on the Mac.');
        await page.locator('#br-follow-form button[type="submit"]').click();
        const replied = await waitFor(() => github.state.comments.some((item) => item.issue === 2 && item.body.startsWith('<!-- kairo-app-message -->') && item.body.includes('It also happens on the Mac.')));
        check(`${engine} · a reply from the app becomes an issue comment`, replied, `${github.state.comments.length} comment(s)`);
        await page.screenshot({ path: join(out, `${engine}-relay.png`) });
        check(`${engine} · no console errors (relay)`, errors.length === 0, errors.join(' | '));
        await context.close();
      });
      // 6 · the setup link opened in the browser is stored and leaves the address
      await scenario(`${engine} · setup link`, async () => {
        const { context, page, errors } = await fresh();
        await page.goto(setupLink().replace('index.html?', 'index.html?entry=shelf&'), { waitUntil: 'load' });
        await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
        const address = await page.evaluate(() => location.search);
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kairo-report-relay-v1') || 'null')?.url);
        check(`${engine} · the setup link is stored on the device and removed from the address`,
          address === '?entry=shelf' && stored === `${relay.origin}/k/${RELAY_KEY}`, `${address} · ${stored}`);
        await page.locator('#tab-me').click();
        await page.locator('#me-settings').click();
        const status = await page.locator('#settings-reports-status').textContent();
        check(`${engine} · Settings says reports go to GitHub automatically`, status.includes('automatically') && status.includes(new URL(relay.origin).host), status);
        check(`${engine} · no console errors (setup link)`, errors.length === 0, errors.join(' | '));
        await context.close();
      });
    } finally {
      await browser.close();
    }
  }
} finally {
  await host.close?.();
  await relay.close();
  await github.close();
}

const failed = checks.filter((item) => !item.pass);
writeFileSync(join(out, 'verification-report.json'), `${JSON.stringify({ suite: 'report-delivery', version, checks }, null, 2)}\n`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
