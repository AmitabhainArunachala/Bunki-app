/** Isolated browser contract fixtures; these service responses are synthetic test data. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = resolve(process.env.BUNKI_REPORT_PROOF_DIR || `${process.env.HOME}/.dharma/bunki_experience/2026-09-23/experience-evolution/report-client-proof`);
mkdirSync(out, { recursive: true });
const js = readFileSync(resolve(here, 'report-client.js'), 'utf8');
const css = readFileSync(resolve(here, 'report-client.css'), 'utf8');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Report client browser fixture</title><style>body{margin:0;background:#f1e9d3;color:#1c2f42;font:16px system-ui}#app{padding:40px;min-height:1400px}input{font:inherit;padding:12px}h1{font:32px Georgia,serif}${css}</style><div id="app"><h1>Learning surface · test fixture</h1><label>Pending answer <input id="answer" value="kept answer"></label><p>Report controls persist outside this application surface.</p></div><script>${js}</script><script>window.hookCalls=0;window.fixture=window.BunkiReports.mount({serviceUrl:'https://reports.bunki.test',getContext:()=>({surface:'test/explanation',route:'/question/2',build_sha:null,content_ids:['fixture:q2'],locale:'en',action_trace:[{action:'explanation_open',target:'fixture:q2',raw_dom:'never capture'}],raw_dom:'never capture',storage:'never capture'}),onOpen:()=>window.hookCalls++});</script></html>`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const requests = [], errors = [], received = new Map();
let failAfterPersistence = true, proposalReady = false, postBodies = [], followCount = 0;
page.on('pageerror', error => errors.push(error.message));
const proposal = {
  schema_version: 'bunki.maintenance/v1', id: 'proposal_fixture', revision: 1, created_at: new Date().toISOString(), kind: 'build_proposal', execution_authority: 'none',
  origin: { kind: 'sensei', actor_ref: 'fixture_ai', model_ref: 'synthetic-fixture-no-live-ai' },
  source_report_ids: [], title: 'Synthetic proposal fixture', problem: 'Reported inconsistent readings.', proposed_change: 'Review the shared explanation renderer.',
  claims: [{ basis: 'user_report', text: 'The learner reported inconsistent readings.', evidence_ids: ['evidence_fixture'] }],
  acceptance_cases: [{ id: 'case_fixture', given: 'A teaching target', when: 'Its explanation opens', then: 'Its verified reading is available.' }],
  unknowns: ['Editorial correctness still needs inspection.'], rollback: 'Restore the previous renderer.', requested_action: 'review', proposed_files: [], evidence: [], context: {}
};
await page.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.hostname === 'bunki.test') return route.fulfill({ contentType: 'text/html', body: html });
  requests.push({ method: request.method(), path: url.pathname });
  const headers = { 'Access-Control-Allow-Origin': 'https://bunki.test', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
  const send = data => route.fulfill({ contentType: 'application/json', headers, body: JSON.stringify(data) });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (url.pathname === '/api/config') return send({ schema_version: 'bunki.maintenance/v1', build: { git_sha: 'a'.repeat(40), artifact_sha256: 'b'.repeat(64) }, content_ids: ['fixture:q2'], ai: { status: 'available', model: 'synthetic-fixture-no-live-ai' } });
  if (url.pathname === '/api/session') return send({ token: 'synthetic-guest-token', actor_ref: 'guest_fixture' });
  if (request.headers().authorization !== 'Bearer synthetic-guest-token') return route.fulfill({ status: 401, headers, body: '{}' });
  if (url.pathname === '/api/reports' && request.method() === 'POST') {
    postBodies.push(request.postData());
    const payload = request.postDataJSON();
    const report = payload.report;
    if (!received.has(report.id)) received.set(report.id, { receipt: { receipt_id: 'receipt_fixture', report_id: report.id, received_at: new Date().toISOString(), payload_sha256: createHash('sha256').update(request.postData()).digest('hex') }, report, status: 'received', conversation: [], triage: { state: 'pending' }, proposals: [] });
    if (failAfterPersistence) { failAfterPersistence = false; return route.abort('failed'); }
    return send(received.get(report.id));
  }
  if (url.pathname.endsWith('/propose')) {
    proposalReady = true;
    for (const view of received.values()) { view.triage = { state: 'complete' }; view.proposals = [{ ...proposal, source_report_ids: [view.report.id] }]; view.conversation = [{ actor: 'sensei', text: 'Synthetic AI fixture response <img src=x onerror=alert(1)>', id: 'message_fixture', created_at: new Date().toISOString() }]; }
    return send({ queued: true, report_id: [...received.keys()][0] });
  }
  if (url.pathname.endsWith('/messages') || url.pathname.endsWith('/reopen')) {
    followCount++;
    const payload = request.postDataJSON(), view = [...received.values()][0];
    view.conversation.push({ actor: 'user', text: payload.text, id: `follow_${followCount}`, created_at: new Date().toISOString() });
    if (url.pathname.endsWith('/reopen')) assert.equal(payload.context.surface, 'test/explanation');
    return send(view);
  }
  if (url.pathname === '/api/reports') return send({ reports: [...received.values()] });
  if (url.pathname.startsWith('/api/reports/')) return send(received.get(url.pathname.split('/')[3]));
  return route.fulfill({ status: 404, headers, body: '{}' });
});

try {
  await page.goto('https://bunki.test');
  await page.evaluate(() => window.fixture.ready);
  assert.equal(requests.length, 0, 'Fresh mount must not make network requests');
  await page.evaluate(() => { window.BunkiReports.mount({ getContext: () => ({ surface: 'test/explanation', route: '/question/2', content_ids: ['fixture:q2'], action_trace: [{ action: 'explanation_open', raw_dom: 'never capture' }], raw_dom: 'never capture' }) }); document.querySelector('#answer').focus(); window.scrollTo(0, 300); });
  await page.evaluate(() => window.fixture.openReport());
  assert.equal(await page.locator('#bunki-reports-root').count(), 1, 'Mount is idempotent');
  assert.equal(await page.evaluate(() => window.hookCalls), 1);
  await page.locator('#br-actual').fill('The second explanation has no reading. <script>bad()</script>');
  await page.locator('#br-expected').fill('The target should show its reading consistently.');
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 8, height: 8 } });
  await page.locator('#br-files').setInputFiles({ name: 'selected-screenshot.png', mimeType: 'image/png', buffer: png });
  await page.locator('[data-br="remove"]').waitFor();
  await page.locator('[data-br="remove"]').click();
  assert.equal(await page.locator('.br-attachments img').count(), 0);
  await page.locator('#br-files').setInputFiles({ name: 'selected-screenshot.png', mimeType: 'image/png', buffer: png });
  await page.locator('.br-attachments img').waitFor();
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.br-body').scrollTop = 0; });
  await page.screenshot({ path: resolve(out, 'desktop.png') });
  await page.setViewportSize({ width: 320, height: 760 });
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.br-body').scrollTop = 0; });
  await page.screenshot({ path: resolve(out, 'mobile-320.png') });
  assert(await page.evaluate(() => document.querySelector('.br-sheet').scrollWidth <= 320));
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'answer');
  assert.equal(await page.locator('#answer').inputValue(), 'kept answer');
  await page.waitForFunction(() => window.scrollY === 300);
  assert.equal(await page.evaluate(() => window.scrollY), 300);
  await page.evaluate(() => window.fixture.openReport());
  assert.match(await page.locator('#br-actual').inputValue(), /second explanation/);
  await page.locator('[data-br="close"]').first().focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.br), 'close', 'Focus wraps to the final return control');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Send report', exact: true }).click();
  await page.getByRole('heading', { name: 'Saved on this device' }).waitFor();
  const durable = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('bunki-maintenance-reports-v1'); r.onsuccess = () => resolve(r.result); });
    const read = store => new Promise(resolve => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); });
    return { rows: await read('records'), attachments: (await read('attachments')).map(item => ({ id: item.id, size: item.blob.size })) };
  });
  assert.equal(durable.rows.length, 1);
  assert.equal(durable.attachments.length, 1);
  assert(durable.attachments[0].size > 0);
  assert(!JSON.stringify(durable.rows).includes('never capture'));
  assert.equal(durable.rows[0].report.context.build.git_sha, null, 'External service build cannot become page provenance');
  await page.reload();
  await page.evaluate(() => window.fixture.ready);
  await page.evaluate(() => window.fixture.openReports());
  await page.locator('[data-br="detail"]').click();
  await page.getByRole('heading', { name: 'Saved on this device' }).waitFor();
  await context.setOffline(false);
  await page.waitForFunction(() => navigator.onLine);
  await page.evaluate(() => window.fixture.retry());
  await page.getByRole('button', { name: 'Refresh & retry' }).click();
  await page.getByRole('heading', { name: 'Received', exact: true }).waitFor();
  assert.equal(received.size, 1, 'Timeout after persistence cannot create duplicate reports');
  assert(postBodies.length >= 2);
  assert.equal(new Set(postBodies).size, 1, 'Retries preserve exact wire payload and idempotency key');
  assert.equal(await page.locator('.br-proposal').count(), 0, 'No local fake AI proposal');
  await page.getByRole('button', { name: 'Ask Sensei for a proposal' }).click();
  await page.getByRole('heading', { name: 'Synthetic proposal fixture' }).waitFor();
  assert(proposalReady);
  assert.equal(await page.locator('.br-thread img').count(), 0, 'AI text is inert text, never executable HTML');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export this proposal JSON' }).click();
  const download = await downloadPromise;
  await download.saveAs(resolve(out, 'synthetic-proposal-export.json'));
  assert.equal(JSON.parse(readFileSync(resolve(out, 'synthetic-proposal-export.json'))).execution_authority, 'none');
  await page.locator('#br-follow').fill('This also happens with the next target.');
  await page.getByRole('button', { name: 'Send follow-up', exact: true }).click();
  await page.getByText('Your follow-up was received.', { exact: true }).first().waitFor();
  await page.locator('#br-follow').fill('Still present after retrying.');
  await page.getByRole('button', { name: 'Still happening', exact: true }).click();
  await page.getByText('The report was reopened with your current screen context.', { exact: true }).first().waitFor();
  assert.equal(followCount, 2);
  await page.evaluate(() => { window.BunkiReports.mount({ protectAnswers: true }); document.querySelector('#app').innerHTML = '<h1>Application rerendered</h1>'; });
  await page.getByRole('button', { name: 'Refresh & retry' }).click();
  await page.getByText('Your report is available. AI analysis and proposals can be read after the protected sitting ends, to keep answer support unchanged.', { exact: true }).waitFor();
  assert.equal(await page.locator('.br-proposal').count(), 0);
  assert.equal(await page.locator('#bunki-reports-root').count(), 1, 'Host rerender preserves reports');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.br-sheet').open);
  await page.evaluate(() => { const overlay = document.createElement('dialog'); overlay.id = 'host-overlay'; overlay.innerHTML = '<button id="host-close">Host overlay control</button>'; document.body.append(overlay); overlay.showModal(); });
  await page.waitForFunction(() => document.querySelector('#bunki-reports-root').parentElement.id === 'host-overlay');
  await page.locator('.br-rail [data-br="open"]').click();
  await page.locator('.br-sheet').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelector('#host-overlay').close());
  await page.waitForFunction(() => document.querySelector('#bunki-reports-root').parentElement === document.body);
  // Same-origin service identity is captured lazily; a different page origin
  // above retained null even though that service returned a known build.
  const ownOrigin = await browser.newContext();
  const ownPage = await ownOrigin.newPage();
  let ownRequests = 0, ownPayload = null;
  const ownPostBodies = [];
  const expectedBuild = { git_sha: 'c'.repeat(40), artifact_sha256: 'd'.repeat(64) };
  await ownPage.route('**/*', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: html.replace("serviceUrl:'https://reports.bunki.test'", "serviceUrl:'https://same.bunki.test'") });
    ownRequests++;
    const send = value => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (path === '/api/config') return send({ schema_version: 'bunki.maintenance/v1', build: expectedBuild });
    if (path === '/api/session') return send({ token: 'same-origin-fixture', actor_ref: 'guest_same_origin' });
    if (path === '/api/reports' && request.method() === 'POST') {
      ownPayload = request.postDataJSON();
      ownPostBodies.push(request.postData());
      if (ownPostBodies.length === 1) return route.abort('failed');
      return send({ report: ownPayload.report, status: 'received', receipt: { receipt_id: 'receipt_same_origin', report_id: ownPayload.report.id, received_at: new Date().toISOString(), payload_sha256: createHash('sha256').update(request.postData()).digest('hex') }, conversation: [], proposals: [] });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });
  await ownPage.goto('https://same.bunki.test');
  await ownPage.evaluate(() => window.fixture.ready);
  assert.equal(ownRequests, 0, 'Same-origin config is also lazy');
  await ownOrigin.setOffline(true);
  await ownPage.evaluate(() => window.fixture.openReport());
  assert.equal(JSON.parse(await ownPage.locator('details pre').textContent()).context.build.git_sha, null, 'Offline same-origin capture stays unknown');
  await ownOrigin.setOffline(false);
  await ownPage.evaluate(() => window.fixture.openReport());
  await ownPage.waitForFunction(sha => document.querySelector('details pre')?.textContent.includes(sha), expectedBuild.git_sha);
  const unicodeWords = 'x'.repeat(3999) + '😀tail';
  await ownPage.locator('#br-actual').fill(unicodeWords);
  await ownPage.getByRole('button', { name: 'Send report', exact: true }).click();
  await ownPage.waitForFunction(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('bunki-maintenance-reports-v1'); r.onsuccess = () => resolve(r.result); });
    const rows = await new Promise(resolve => { const r = db.transaction('records').objectStore('records').getAll(); r.onsuccess = () => resolve(r.result); });
    return rows[0]?.wire_text && rows[0]?.delivery_error;
  });
  await ownPage.waitForFunction(() => document.querySelector('.br-body').textContent.includes('Failed to fetch'));
  await ownPage.evaluate(() => window.fixture.retry());
  await ownPage.getByRole('heading', { name: 'Received', exact: true }).waitFor();
  assert.deepEqual(ownPayload.report.context.build, expectedBuild, 'Same-origin outbox uses the exact service build');
  assert.equal(ownPayload.report.user_words, unicodeWords, 'Original user words remain intact');
  assert.equal(ownPayload.report.actual, 'x'.repeat(3999) + '😀');
  const quote = ownPayload.report.evidence.find(item => item.kind === 'user_quote');
  assert.equal(quote.summary, ownPayload.report.actual);
  assert(ownPayload.report.actual.isWellFormed() && quote.summary.isWellFormed(), 'Bounded fields contain no isolated surrogate');
  assert.equal(Array.from(ownPayload.report.actual).length, 4000);
  assert.equal(ownPostBodies.length, 2);
  assert.equal(new Set(ownPostBodies).size, 1, 'Unicode payload retries retain the same request and digest');
  await ownOrigin.close();
  assert.deepEqual(errors, []);
  writeFileSync(resolve(out, 'browser-results.json'), JSON.stringify({ passed: true, cases: ['idle_mount', 'idempotent_mount', 'allowlisted_context', 'attachment_preview_remove', 'mobile_320', 'focus_scroll_return', 'offline_atomic_outbox', 'reload_recovery', 'timeout_after_persistence', 'stable_wire_retry', 'honest_ai', 'inert_untrusted_text', 'proposal_export', 'followup', 'reopen', 'protected_answers', 'host_rerender', 'native_host_modal', 'same_origin_lazy_build', 'same_origin_offline_unknown', 'cross_origin_build_not_substituted', 'unicode_codepoint_bounds', 'unicode_stable_wire_receipt'], service_fixture: 'synthetic, no live AI', received_reports: received.size, post_attempts: postBodies.length, errors }, null, 2));
  console.log(`Report client browser checks passed. Evidence: ${out}`);
} catch (error) { console.error(await page.locator('.br-body').innerText().catch(() => '')); throw error; } finally { await browser.close(); }
