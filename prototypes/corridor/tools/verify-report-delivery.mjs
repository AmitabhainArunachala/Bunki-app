/** Problem reports reach GitHub, through the report relay or, on a device not set
 * up for it, through a prefilled GitHub issue.
 *
 * Runs the built site as GitHub Pages serves it: with no service of its own, the
 * client's /api/config probe gets the host's 404. github.com is stubbed so no real
 * issue is ever opened, and the relay runs locally against a mock GitHub API.
 * Checks, per engine, for the prefilled-issue fallback:
 *   1. the sheet offers its Send (data-delivery github; Q: "Send to GitHub" became learner words, GitHub under
 *      Details) and opens one prefilled new-issue page
 *      in the same tap (title, label, marker, words, version, screen, report ID);
 *   2. the saved copy names the same report and is marked "Opened on GitHub";
 *   3. very long words are shortened to fit GitHub's address limit;
 *   4. when the browser blocks the window, the report is saved with a working
 *      "Send to GitHub" link (the path for reports saved by earlier versions);
 *   5. "Copy report text" copies the same issue text (Chromium only);
 *   6. no console errors.
 * and for the relay (services/report-relay):
 *   7. the setup link, pasted in Settings (as in a home-screen app) or opened in
 *      the browser, sets up the device and leaves the address; an opened link
 *      changes nothing by itself: it waits in Settings, naming the host the
 *      reports would go to, until Set up is chosen;
 *   8. a report saved before setup is filed automatically, and stays listed and
 *      is retried when its first delivery fails;
 *   9. a new report with a screenshot becomes a labelled issue, linked in the app,
 *      with the screenshot served by the relay;
 *  10. the fixer's comment and status appear in the app, and a reply from the app
 *      becomes an issue comment;
 *  11. a browser that cannot store a Blob in IndexedDB still saves and files the
 *      screenshot.
 */
/* global document, window, indexedDB, navigator, location, fetch, IDBObjectStore, Blob, DOMException */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { reportCopyObservation, expectedReportChecks, exactNamedCompletion, REPORT_COPY_CONTROLS } from './vh-learning-contracts.mjs';
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
const identity = JSON.parse(readFileSync(join(host.site, 'build-identity.json'), 'utf8'));
const runId = process.env.KAIRO_GATE_RUN_ID || randomUUID();
const startedAt = new Date().toISOString();
const verifierGitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const verifierSha256 = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
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
assert(!process.env.KAIRO_BROWSER || ['chromium','webkit','all'].includes(process.env.KAIRO_BROWSER), 'unknown browser');
assert(process.argv.length === 2, 'report-delivery takes no narrowing arguments');
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? { [process.env.KAIRO_BROWSER]: ({chromium,webkit})[process.env.KAIRO_BROWSER] } : { chromium, webkit };
const versions = {}, controls = [], scenarios = [];
const COPY_CONTROLS = REPORT_COPY_CONTROLS;
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
    scenarios.push({name, completed: true});
  } catch (error) {
    scenarios.push({name, completed: false});
    check(`${name} ran to completion`, false, String(error?.message || error).split('\n').slice(0, 3).join(' '));
  }
};

// An opened setup link waits in Settings, naming its host; Set up stores it and reloads.
async function acceptSetupLink(page) {
  await page.goto(setupLink().replace('index.html?', 'index.html?entry=shelf&'), { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
  await page.locator('#settings-report-offer').waitFor();
  await Promise.all([page.waitForEvent('load'), page.locator('#settings-report-save').click()]);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
}

async function openSheet(page, beforeProbe, locale = 'en') {
  await page.goto(`${host.origin}/index.html?entry=shelf&ui=${locale === 'ja' ? 'ja' : 'bi'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
  await page.locator('#bunki-report-bug').click();
  await page.locator('#br-actual').waitFor();
  if (beforeProbe) await beforeProbe();
  // The sheet settles once the service probe has answered with the host's 404. Q · its button says Send in the learner's
  // words; the way it sends is its data-delivery (github: the prefilled issue page)
  await page.waitForFunction(() => document.querySelector('#br-form .br-primary')?.dataset.delivery === 'github', null, { timeout: 15_000 });
}
// What the sheet shows, for a failure message.
const sheetState = (page) =>
  page.evaluate(() => [document.querySelector('#br-title')?.textContent, document.querySelector('.br-body h3')?.textContent,
    document.querySelector('.br-notice')?.textContent, document.querySelector('.br-error, [role="alert"]')?.textContent].filter(Boolean).join(' · ') || 'no sheet');
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


async function observeCopy(page, options = {}) {
  const button = page.locator('#br-form .br-primary');
  const label = options.pending || options.relay ? 'Send report' : options.locale === 'ja' ? '送る' : 'Send';
  const state = await button.evaluate(node => ({visible:node.innerText.trim(),delivery:node.dataset.delivery,disabled:node.disabled}));
  state.visibleShown = await button.isVisible();
  state.accessible = await page.getByRole('button',{name:label,exact:true}).evaluateAll((nodes,node)=>nodes.includes(node),await button.elementHandle()) ? label : '[accessible name mismatch]';
  return { observed:state, assertions:reportCopyObservation(state,options) };
}
async function disclosure(page, locale = 'en', relayMode = false) {
  const details=page.locator('#br-form .br-details');
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  const expected=locale==='ja' ? (relayMode ? '送った報告は、画像と一緒に GitHub の公開ページに載る。個人的なことは書かない。写しはこの端末に残る。' : '報告は、アプリを直す人が読む GitHub の公開ページに、あなたの言葉とこの画面の欄を入れて開く。そこで「Submit new issue」を押すと送られる。公開されるので、個人的なことは書かない。写しはこの端末に残る。')
    : relayMode ? 'Send report files it as a public GitHub issue, with its screenshots, so leave out anything private. A copy stays on this device.' : 'This opens GitHub with your words and this screen filled in. Tap “Submit new issue” there to send it. Issues in this repository are public, so leave out anything private. A copy stays on this device.';
  const node=details.getByText(expected,{exact:true});
  return {expected, pass:await node.count()===1 && await node.isVisible(), text:await details.innerText()};
}
async function copyControl(page, {name,engine,locale,options={},mutate,observe=()=>observeCopy(page,options),kills}) {
  const before=await observe();
  const button=page.locator('#br-form .br-primary'), details=page.locator('#br-form .br-details');
  const snapshot=await page.evaluate(()=>({button:document.querySelector('#br-form .br-primary').outerHTML,details:document.querySelector('#br-form .br-details').outerHTML}));
  let mutant,restored,error=null;
  try {await mutate(button,details); mutant=await observe();}
  catch(e) {error=String(e.stack || e);}
  finally {
    await page.evaluate(saved=>{document.querySelector('#br-form .br-primary').outerHTML=saved.button;document.querySelector('#br-form .br-details').outerHTML=saved.details;},snapshot);
    restored=await observe();
  }
  const clean=row=>row && Object.values(row.assertions).every(value=>value===true);
  const reds=mutant ? Object.keys(mutant.assertions).filter(key=>!mutant.assertions[key]) : [];
  const killed=!error && clean(before) && clean(restored) && reds.length===kills.length && kills.every(key=>reds.includes(key));
  const proof={name,engine,locale,kind:'isolated DOM observation control',before,mutant,restored,error,kills,verdict:killed?'killed':'incomplete'};
  controls.push(proof); check(`${engine}/${locale}/C.${name}`,killed,JSON.stringify(proof));
}

try {
  for (const [engine, browserType] of Object.entries(engines)) {
    console.log(`\n— ${engine}`);
    const browser = await browserType.launch({ ...(engine === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    versions[engine] = browser.version();
    try {
      const fresh = async ({ blockWindows = false, holdProbe = false } = {}) => {
        let releaseProbe = () => {};
        const probe = new Promise(done => { releaseProbe = done; });
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
        if (holdProbe) await context.route(`${host.origin}/api/config`, async (route) => {
          await probe;
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
        return { context, page, errors, releaseProbe };
      };

      // Q's approved Send/送る copy, real held probe, and public disclosure under Details.
      for (const locale of ['en','ja']) await scenario(`${engine} · copy ${locale}`,async()=>{
        const {context,page,errors,releaseProbe}=await fresh({holdProbe:true});
        try {
          await openSheet(page,async()=>{
            const state=await observeCopy(page,{locale,pending:true});
            check(`${engine}/${locale}/pending-copy`,Object.values(state.assertions).every(Boolean),JSON.stringify(state));
            await copyControl(page,{name:'fallback-advertised-before-probe',engine,locale,options:{locale,pending:true},kills:['delivery'],mutate:button=>button.evaluate(node=>{node.dataset.delivery='github';})});
            releaseProbe();
          },locale);
          const state=await observeCopy(page,{locale});
          check(`${engine}/${locale}/fallback-copy`,Object.values(state.assertions).every(Boolean),JSON.stringify(state));
          for(const [name,value] of [['fallback-copy-empty',''],['fallback-copy-wrong','Wrong send label']])
            await copyControl(page,{name,engine,locale,options:{locale},kills:['label'],mutate:button=>button.evaluate((node,text)=>{node.textContent=text;},value)});
          await copyControl(page,{name:'fallback-accessible-name-wrong',engine,locale,options:{locale},kills:['label'],mutate:button=>button.evaluate(node=>node.setAttribute('aria-label','Wrong accessible label'))});
          const note=await disclosure(page,locale);
          check(`${engine}/${locale}/public-disclosure`,note.pass,note.text);
          await copyControl(page,{name:'public-disclosure-removed',engine,locale,kills:['disclosure'],
            observe:async()=>{const note=await disclosure(page,locale);return {observed:note,assertions:{disclosure:note.pass}};},
            mutate:async(_button,details)=>{await details.getByText(note.expected,{exact:true}).evaluate(node=>node.remove());}});
          check(`${engine}/${locale}/copy-page-errors`,errors.length===0,errors.join(' | '));
        } finally {releaseProbe();await context.close();}
      });

      // 1–2 · one tap opens the prefilled issue and saves the same report
      await scenario(`${engine} · prefilled issue`, async () => {
        const { context, page, errors } = await fresh();
        await openSheet(page);
        const note = await disclosure(page);
        check(`${engine} · the sheet says GitHub issues are public before anything is sent`, note.pass, note.text);
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
        const { context, page, errors, releaseProbe } = await fresh({ blockWindows: true, holdProbe: true });
        let pendingLabel = '';
        await openSheet(page, async () => { pendingLabel = await page.locator('#br-form .br-primary').getAttribute('data-delivery'); releaseProbe(); });
        check(`${engine} · GitHub is offered only after the probe confirms there is no service`,
          !!pendingLabel && pendingLabel !== 'github', `while pending: ${pendingLabel}`);
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
        // GitHub is down for the adopted report's first delivery: it must stay listed and be retried
        github.state.failCreate = true;
        const errorsBefore = errors.length;
        await page.locator('#settings-report-link').fill(setupLink());
        await Promise.all([page.waitForEvent('load'), page.locator('#settings-report-save').click()]);
        await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kairo-report-relay-v1') || 'null')?.url);
        check(`${engine} · pasting the setup link in Settings sets up this device`,
          before === 'On this device, sending a report opens a page where you finish sending it.' && stored === `${relay.origin}/k/${RELAY_KEY}`, `${before} → ${stored}`);
        let failed = null;
        for (const deadline = Date.now() + 20_000; !failed && Date.now() < deadline; await page.waitForTimeout(250))
          failed = (await savedRows(page)).find((row) => row.delivery_error) || null;
        await page.locator('#bunki-report-bug').click();
        await page.locator('[data-br="list"]').first().click();
        await page.locator('.br-report-list').waitFor();
        const listed = await page.locator('.br-report-list li').count();
        check(`${engine} · a report from before setup whose first delivery fails stays listed, bound to the relay`,
          !!failed?.wire_text && failed.service === `${relay.origin}/k/${RELAY_KEY}` && listed === 1,
          JSON.stringify({ error: failed?.delivery_error, service: failed?.service, listed }));
        github.state.failCreate = false;
        await page.locator('[data-br="refresh"]').click();
        await waitFor(() => github.state.issues.length === 1);
        check(`${engine} · the report saved before setup is filed once GitHub answers`,
          github.state.issues.length === 1 && github.state.issues[0].body.includes('Saved before the relay was set up.'), github.state.issues[0]?.title || 'no issue');
        // the relay's 502s while GitHub was down are the outage itself, not page faults
        errors.splice(errorsBefore, Infinity, ...errors.slice(errorsBefore).filter((text) => !/\b502\b/.test(text)));
        await page.locator('.br-sheet .br-close').click();

        await page.locator('#bunki-report-bug').click();
        await page.locator('#br-actual').waitFor();
        const ready = await page.waitForFunction(() => document.querySelector('#br-form .br-primary')?.textContent === 'Send report', null, { timeout: 15_000 }).then(() => true, () => false);
        check(`${engine} · with the relay set up, the sheet sends reports itself`, ready, await page.locator('#br-form .br-primary').textContent());
        const sendNote = await disclosure(page, 'en', true);
        const relayCopy = await observeCopy(page, {relay:true});
        check(`${engine}/relay-copy`, Object.values(relayCopy.assertions).every(Boolean), JSON.stringify(relayCopy));
        check(`${engine} · before sending, the sheet says the report and its screenshots become a public GitHub issue`,
          sendNote.pass, sendNote.text);
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
          received ? `${filed?.html_url} · app link ${link}` : await sheetState(page));
        if (!filed) throw new Error('No issue was filed for the report with a screenshot.');
        const shot = /\((http:\/\/127\.0\.0\.1:\d+\/v1\/shots\/shot_[a-f0-9]{32})\)/.exec(filed?.body || '')?.[1];
        const bytes = shot ? Buffer.from(await (await fetch(shot)).arrayBuffer()) : null;
        check(`${engine} · the screenshot is in the issue, served by the relay`, !!bytes && bytes.equals(PIXEL_PNG), shot || 'no screenshot link');
        const kept = await page.evaluate(() => new Promise((resolve, reject) => {
          const request = indexedDB.open('bunki-maintenance-reports-v1');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const read = request.result.transaction('attachments').objectStore('attachments').getAll();
            read.onsuccess = () => { resolve(read.result.map((item) => ({ blob: 'blob' in item, bytes: item.bytes instanceof ArrayBuffer ? item.bytes.byteLength : null }))); request.result.close(); };
            read.onerror = () => reject(read.error);
          };
        }));
        check(`${engine} · the device stores the screenshot as bytes, not as a Blob`, kept.length === 1 && !kept[0].blob && kept[0].bytes === PIXEL_PNG.length, JSON.stringify(kept));

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
      // 6 · a browser that cannot store a Blob in IndexedDB (WebKit private browsing,
      //     and some iPhones) still saves and sends the screenshot
      await scenario(`${engine} · no Blob storage`, async () => {
        const { context, page, errors } = await fresh();
        await context.addInitScript(() => {
          const put = IDBObjectStore.prototype.put;
          const holdsBlob = (value, depth = 0) => value instanceof Blob ||
            (depth < 6 && !!value && typeof value === 'object' && !(value instanceof ArrayBuffer) && Object.values(value).some((item) => holdsBlob(item, depth + 1)));
          IDBObjectStore.prototype.put = function (value, ...rest) {
            if (this.transaction.db.name === 'bunki-maintenance-reports-v1' && holdsBlob(value))
              throw new DOMException('Error preparing Blob/File data to be stored in object store', 'UnknownError');
            return put.call(this, value, ...rest);
          };
        });
        const before = github.state.issues.length;
        await acceptSetupLink(page);
        await page.locator('#bunki-report-bug').click();
        await page.waitForFunction(() => document.querySelector('#br-form .br-primary')?.textContent === 'Send report', null, { timeout: 15_000 });
        await page.locator('#br-actual').fill('Screenshot from a browser without Blob storage.');
        await page.locator('#br-files').setInputFiles({ name: 'blobless.png', mimeType: 'image/png', buffer: PIXEL_PNG });
        await page.locator('.br-attachments figure').waitFor();
        await page.locator('#br-form .br-primary').click();
        const received = await page.waitForFunction(() => document.querySelector('.br-body h3')?.textContent === 'Received', null, { timeout: 20_000 }).then(() => true, () => false);
        const filed = github.state.issues.length > before ? github.state.issues.at(-1) : null;
        const shot = /\((http:\/\/127\.0\.0\.1:\d+\/v1\/shots\/shot_[a-f0-9]{32})\)/.exec(filed?.body || '')?.[1];
        const bytes = shot ? Buffer.from(await (await fetch(shot)).arrayBuffer()) : null;
        check(`${engine} · without Blob storage, the report and its screenshot are saved and filed`,
          received && !!filed && filed.body.includes('Screenshot from a browser without Blob storage.') && !!bytes && bytes.equals(PIXEL_PNG),
          received ? shot || 'no screenshot link' : await sheetState(page));
        check(`${engine} · no console errors (no Blob storage)`, errors.length === 0, errors.join(' | '));
        await context.close();
      });

      // 7 · the setup link opened in the browser leaves the address and waits in
      //     Settings, naming its host, until Set up stores it
      await scenario(`${engine} · setup link`, async () => {
        const { context, page, errors } = await fresh();
        await page.goto(setupLink().replace('index.html?', 'index.html?entry=shelf&'), { waitUntil: 'load' });
        await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
        const offered = await page.evaluate(() => ({
          address: location.search,
          stored: localStorage.getItem('kairo-report-relay-v1'),
          room: document.documentElement.dataset.room,
          offer: document.querySelector('#settings-report-offer')?.textContent || '',
          field: document.querySelector('#settings-report-link')?.value || '',
        }));
        const fieldLink = new URL(offered.field);
        check(`${engine} · an opened setup link changes nothing by itself: it leaves the address and waits in Settings, naming its host`,
          offered.address === '?entry=shelf' && offered.stored === null && offered.room === 'settings' &&
            offered.offer.includes(new URL(relay.origin).host) && /public GitHub issues/.test(offered.offer) &&
            fieldLink.searchParams.get('report-relay') === relay.origin && fieldLink.searchParams.get('report-key') === RELAY_KEY,
          JSON.stringify(offered));
        const focused = await page.waitForFunction(() => document.activeElement?.id === 'settings-report-save', null, { timeout: 5_000 }).then(() => true, () => false);
        check(`${engine} · Set up is focused, one tap away`, focused, await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName));
        await Promise.all([page.waitForEvent('load'), page.locator('#settings-report-save').click()]);
        await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
        const address = await page.evaluate(() => location.search);
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kairo-report-relay-v1') || 'null')?.url);
        check(`${engine} · Set up stores the opened link on the device, and the address stays clean`,
          address === '?entry=shelf' && stored === `${relay.origin}/k/${RELAY_KEY}`, `${address} · ${stored}`);
        await page.locator('#tab-me').click();
        await page.locator('#me-settings').click();
        const status = await page.locator('#settings-reports-status').textContent();
        const offerAgain = await page.locator('#settings-report-offer').count();
        check(`${engine} · Settings says reports go to GitHub automatically, with no link waiting`, status.includes('automatically') && status.includes(new URL(relay.origin).host) && offerAgain === 0, `${status} · offers ${offerAgain}`);
        check(`${engine} · no console errors (setup link)`, errors.length === 0, errors.join(' | '));
        await context.close();
      });
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  check('terminal error', false, String(error.stack || error));
} finally {
  for (const resource of [host,relay,github]) await resource.close?.().catch(error=>check('cleanup error',false,String(error)));
  const expectedControls=Object.keys(engines).flatMap(engine=>['en','ja'].flatMap(locale=>COPY_CONTROLS.map(name=>`${engine}/${locale}/${name}`)));
  const observedControls=controls.map(row=>`${row.engine}/${row.locale}/${row.name}`);
  const expectedChecks=expectedReportChecks(Object.keys(engines));
  const expectedScenarios=Object.keys(engines).flatMap(engine=>['copy en','copy ja','prefilled issue','long report','blocked window','relay','no Blob storage','setup link'].map(name=>`${engine} · ${name}`));
  const fullAcceptance=exactNamedCompletion(checks,expectedChecks) && exactNamedCompletion(scenarios,expectedScenarios,'name','completed') && observedControls.length===expectedControls.length && new Set(observedControls).size===expectedControls.length
    && expectedControls.every(id=>observedControls.includes(id)) && controls.every(row=>row.verdict==='killed');
  writeFileSync(join(out, 'verification-report.json'), `${JSON.stringify({schema:'vh-report-delivery/1',suite:'report-delivery',version,runId,startedAt,finishedAt:new Date().toISOString(),
    gitSha:identity.gitSha,artifactSha256:identity.artifactSha256,verifierGitSha,verifierSha256,engines:Object.keys(engines),browsers:versions,scope:Object.keys(engines).length===2?'full-engine':'diagnostic',checks,expectedChecks,scenarios,expectedScenarios,controls,expectedControls,observedControls,fullAcceptance},null,2)}\n`);
  console.log(`\n${checks.filter(row=>row.pass).length}/${checks.length} checks passed`);
  if (!fullAcceptance) process.exitCode=1;
}
