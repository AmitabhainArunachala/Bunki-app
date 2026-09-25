/** Isolated browser contract fixtures; these service responses are synthetic test data. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium, webkit } from 'playwright-core';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = resolve(process.env.BUNKI_REPORT_PROOF_DIR || `${process.env.HOME}/.dharma/bunki_experience/2026-09-23/experience-evolution/report-client-proof`);
mkdirSync(out, { recursive: true });
const sourcePath = resolve(process.env.BUNKI_REPORT_CLIENT_SOURCE || resolve(here, 'report-client.js'));
let browser, sourceIdentity = null, stage = 'setup', terminalResult = null, ackCleanupFailure = null;
const engineIdentity = { name: process.env.BUNKI_REPORT_BROWSER ?? 'chromium', version: null };
const ackCleanupEvidence = [];
try {
const js = readFileSync(sourcePath, 'utf8');
sourceIdentity = { path: sourcePath, sha256: createHash('sha256').update(js).digest('hex') };
const css = readFileSync(resolve(here, 'report-client.css'), 'utf8');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Report client browser fixture</title><style>body{margin:0;background:#f1e9d3;color:#1c2f42;font:16px system-ui}#app{padding:40px;min-height:1400px}input{font:inherit;padding:12px}h1{font:32px Georgia,serif}${css}</style><div id="app"><h1>Learning surface · test fixture</h1><label>Pending answer <input id="answer" value="kept answer"></label><p>Report controls persist outside this application surface.</p></div><script>${js}</script><script>window.hookCalls=0;window.fixture=window.BunkiReports.mount({serviceUrl:'https://reports.bunki.test',getContext:()=>({surface:'test/explanation',route:'/question/2',build_sha:null,content_ids:['fixture:q2'],locale:'en',action_trace:[{action:'explanation_open',target:'fixture:q2',raw_dom:'never capture'}],raw_dom:'never capture',storage:'never capture'}),onOpen:()=>window.hookCalls++});</script></html>`;
stage = 'browser-selection';
if (!['chromium', 'webkit'].includes(engineIdentity.name)) throw new Error('BUNKI_REPORT_BROWSER must be chromium or webkit.');
browser = await ({ chromium, webkit })[engineIdentity.name].launch({ headless: true });
engineIdentity.version = browser.version();
stage = 'browser-setup';
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const requests = [], errors = [], received = new Map();
let failAfterPersistence = true, proposalReady = false, postBodies = [], followCount = 0;
let followupGate = null;
const followupBodies = [], followupKeys = new Set();
page.on('pageerror', error => errors.push(error.message));
const proposal = {
  schema_version: 'bunki.maintenance/v1', id: 'proposal_fixture', revision: 1, created_at: new Date().toISOString(), kind: 'build_proposal', execution_authority: 'none',
  origin: { kind: 'sensei', actor_ref: 'fixture_ai', model_ref: 'synthetic-fixture-no-live-ai' },
  source_report_ids: [], title: 'Synthetic proposal fixture', problem: 'Reported inconsistent readings.', proposed_change: 'Review the shared explanation renderer.',
  claims: [{ basis: 'user_report', text: 'The learner reported inconsistent readings.', evidence_ids: ['evidence_fixture'] }],
  acceptance_cases: [{ id: 'case_fixture', given: 'A teaching target', when: 'Its explanation opens', then: 'Its verified reading is available.' }],
  unknowns: ['Editorial correctness still needs inspection.'], rollback: 'Restore the previous renderer.', requested_action: 'review', proposed_files: [], evidence: [], context: {}
};
const serveFixture = async route => {
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
    const payload = request.postDataJSON(), view = [...received.values()][0];
    followupBodies.push(request.postData());
    if (!followupKeys.has(payload.idempotency_key)) {
      followupKeys.add(payload.idempotency_key); followCount++;
      view.conversation.push({ actor: 'user', text: payload.text, id: `follow_${followCount}`, created_at: new Date().toISOString() });
    }
    if (url.pathname.endsWith('/reopen')) assert.equal(payload.context.surface, 'test/explanation');
    if (followupGate) {
      const gate = followupGate; followupGate = null; gate.arrive();
      const outcome = await gate.release;
      if (outcome === 'abort') return route.abort('failed');
    }
    return send(view);
  }
  if (url.pathname === '/api/reports') return send({ reports: [...received.values()] });
  if (url.pathname.startsWith('/api/reports/')) return send(received.get(url.pathname.split('/')[3]));
  return route.fulfill({ status: 404, headers, body: '{}' });
};
await context.route('**/*', serveFixture);

try {
  stage = 'existing-browser-contracts';
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
  stage = 'followup-draft-races';
  const holdFollowup = () => {
    let arrive, release;
    const reached = new Promise(resolve => { arrive = resolve; });
    const wait = new Promise(resolve => { release = resolve; });
    followupGate = { arrive, release: wait };
    return { reached, release };
  };
  // Acknowledging A cannot clear B typed while A's response is outstanding.
  let held = holdFollowup();
  await page.locator('#br-follow').fill('Pending A: delayed acknowledgement.');
  await page.getByRole('button', { name: 'Send follow-up', exact: true }).click();
  await held.reached;
  await page.locator('#br-follow').fill('Next B: preserve this exact unsent detail.');
  await waitForDraftText(page, 'Next B: preserve this exact unsent detail.');
  held.release('success');
  await page.getByText('Your follow-up was received.', { exact: true }).first().waitFor();
  assert.equal(await page.locator('#br-follow').inputValue(), 'Next B: preserve this exact unsent detail.');
  await page.reload();
  await openFirstReport(page);
  assert.equal(await page.locator('#br-follow').inputValue(), 'Next B: preserve this exact unsent detail.', 'ACK A must preserve B after reload');
  // A service persists C, then its response exceeds the native fetch deadline. D remains editable and
  // durable while an explicit retry recovers C with its identical wire body.
  held = holdFollowup();
  await page.locator('#br-follow').fill('Pending C: recover exactly after connection loss.');
  await page.getByRole('button', { name: 'Still happening', exact: true }).click();
  await held.reached;
  const frozenFollowup = followupBodies.at(-1);
  await page.locator('#br-follow').fill('Next D: survives failed C, reload and retry.');
  await waitForDraftText(page, 'Next D: survives failed C, reload and retry.');
  await page.getByText(/Your pending follow-up is kept on this device.*The service did not reply in time/).first().waitFor({ timeout: 25000 });
  held.release('success'); // The response arrives after the real fetch deadline; it cannot acknowledge the client.
  await page.reload();
  await openFirstReport(page);
  assert.equal(await page.locator('#br-follow').inputValue(), 'Next D: survives failed C, reload and retry.');
  assert.equal(await page.getByRole('button', { name: 'Send follow-up', exact: true }).isDisabled(), true);
  assert.match(await page.locator('.br-pending').innerText(), /Pending C: recover exactly/);
  await page.getByRole('button', { name: 'Retry pending follow-up', exact: true }).click();
  await page.getByText('The report was reopened with your current screen context.', { exact: true }).first().waitFor();
  assert.equal(followupBodies.at(-1), frozenFollowup, 'Retry retains the original request ID, action and captured context');
  assert.equal(followupBodies.filter(body => body === frozenFollowup).length, 2);
  assert.equal(followCount, 4, 'The synthetic service receives one logical message per request ID');
  assert.equal(await page.locator('#br-follow').inputValue(), 'Next D: survives failed C, reload and retry.');
  await page.reload();
  await openFirstReport(page);
  assert.equal(await page.locator('#br-follow').inputValue(), 'Next D: survives failed C, reload and retry.');
  assert.equal(await page.locator('.br-pending').count(), 0);
  stage = 'followup-ack-cleanup-abort'; await verifyFollowupAckCleanup(page, holdFollowup);
  stage = 'followup-equal-revision-owner'; await verifyFollowupOwnerIsolation(page);
  stage = 'followup-unmount-drain'; await verifyFollowupUnmount(page, holdFollowup);

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
  await pollNativeState(async () => {
    const rows = await readReportStoreRows(ownPage, 'records');
    return Boolean(rows[0]?.wire_text && rows[0]?.delivery_error);
  }, { timeoutMs: 30000, description: 'same-origin outbox wire text and delivery error' });
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
  stage = 'independent-drafts'; await verifyIndependentDrafts(png);
  stage = 'attachment-recovery-race'; await verifyAttachmentRecovery(png);
  stage = 'hostile-config'; await verifyHostileConfig(png);
  stage = 'no-service-durable-save'; await verifyNoServiceDurability();
  assert.deepEqual(errors, []);
  terminalResult = { passed: true, cases: ['idle_mount', 'idempotent_mount', 'allowlisted_context', 'attachment_preview_remove', 'mobile_320', 'focus_scroll_return', 'offline_atomic_outbox', 'reload_recovery', 'timeout_after_persistence', 'stable_wire_retry', 'honest_ai', 'inert_untrusted_text', 'proposal_export', 'followup', 'reopen', 'protected_answers', 'host_rerender', 'native_host_modal', 'same_origin_lazy_build', 'same_origin_offline_unknown', 'cross_origin_build_not_substituted', 'unicode_codepoint_bounds', 'unicode_stable_wire_receipt', 'followup_ack_preserves_new_draft', 'followup_pending_retry_preserves_new_draft', 'two_tab_draft_attachment_isolation', 'duplicated_tab_revision_fork', 'orphan_draft_recovery', 'legacy_draft_retained', 'hostile_config_limits', 'no_service_capability_before_save', 'durable_save_ack_boundary', 'equal_revision_duplicate_first_report', 'equal_revision_duplicate_first_followup', 'unmount_drains_accepted_followup_ack_and_saves', 'unmount_failed_flush_retains_editor', 'attachment_validation_blocks_recovery', 'attachment_validation_checks_draft_identity', 'native_modal_keyboard_frozen_during_unmount', 'native_modal_keyboard_restored_after_failed_unmount', 'ack_cleanup_abort_preserves_pending_and_next_draft', 'ack_cleanup_abort_retry_same_request_once', 'ack_cleanup_abort_preserves_newer_input', 'ack_refresh_abort_is_not_a_delivery_or_draft_failure'], source: sourceIdentity, browser: engineIdentity, service_fixture: 'synthetic, no live AI', received_reports: received.size, post_attempts: postBodies.length, errors };
  terminalResult.ackCleanupEvidence = ackCleanupEvidence;
} catch (error) { console.error(await page.locator('.br-body').innerText().catch(() => '')); throw error; }


async function installAckCleanupFault(target, settings) {
  await target.evaluate(({ sentText, draftText, laterText, mode }) => {
    const put = IDBObjectStore.prototype.put, getAll = IDBObjectStore.prototype.getAll;
    // IndexedDB dispatch reaches the database ancestor before transaction-target handlers.
    // Observe the exact native transaction; do not replace oncomplete or settle its promise.
    const cleanupCompleteCapture = true;
    const cleanupCompleteOnDatabase = true;
    const proof = window.__ackCleanupProof = { receiptCommitted: false, cleanupStarted: false, cleanupCommitted: false, cleanupAborted: false, cleanupCount: 0, laterCommitted: false, refreshStarted: false, refreshAborted: false };
    proof.mode = mode; proof.cleanupCompleteCapture = cleanupCompleteCapture; proof.events = []; proof.droppedEvents = 0; proof.restored = false; proof.transactions = [];
    proof.cleanupCompleteOnDatabase = cleanupCompleteOnDatabase;
    proof.cleanupCompleteListenerAttached = false; proof.ignoredCleanupCompletions = 0;
    let cleanupDatabase = null, removeCleanupCompleteListener = () => {};
    const transactions = new WeakMap(); let nextTransaction = 0, sequence = 0;
    const transactionId = tx => {
      if (!transactions.has(tx)) {
        transactions.set(tx, ++nextTransaction);
        proof.transactions.push({ id: nextTransaction, database: tx.db.name, mode: tx.mode, stores: Array.from(tx.objectStoreNames) });
      }
      return transactions.get(tx);
    };
    const trace = (event, detail = {}) => {
      const row = { sequence: ++sequence, event, at: performance.now(), receiptCommitted: proof.receiptCommitted,
        cleanupStarted: proof.cleanupStarted, cleanupCommitted: proof.cleanupCommitted, cleanupAborted: proof.cleanupAborted,
        refreshStarted: proof.refreshStarted, refreshAborted: proof.refreshAborted, ...detail };
      if (proof.events.length < 128) proof.events.push(row); else proof.droppedEvents++;
    };
    trace('fault-installed');
    window.__restoreAckCleanupFault = () => {
      trace('fault-restoring'); removeCleanupCompleteListener('fault-restoration');
      IDBObjectStore.prototype.put = put; IDBObjectStore.prototype.getAll = getAll; proof.restored = true;
    };
    IDBObjectStore.prototype.put = function(value, ...args) {
      const request = put.call(this, value, ...args), tx = this.transaction;
      if (this.name === 'records' && value.view?.receipt && value.view.conversation?.some(item => item.actor === 'user' && item.text === sentText)) {
        trace('received-view-put', { transaction: transactionId(tx), oncompleteAlreadyAssigned: typeof tx.oncomplete === 'function' });
        tx.addEventListener('complete', () => { proof.receiptCommitted = true; trace('receipt-complete-listener', { transaction: transactionId(tx) }); }, { once: true });
      }
      const draft = this.name === 'meta' && value.key?.startsWith('followup:') ? value.value?.draft : null;
      if (draft && laterText && draft.text === laterText && !draft.pending) {
        tx.addEventListener('complete', () => { proof.laterCommitted = true; }, { once: true });
      }
      // Target only the actual no-pending checkpoint after this received view's
      // native records commit. Earlier A/B writes and subsequent C are untouched.
      if (draft?.text === draftText && !draft.pending) trace('cleanup-candidate-put', { transaction: transactionId(tx), oncompleteAlreadyAssigned: typeof tx.oncomplete === 'function' });
      if (!proof.cleanupStarted && proof.receiptCommitted && draft?.text === draftText && !draft.pending) {
        proof.cleanupStarted = true; proof.cleanupCount++; cleanupDatabase = tx.db;
        trace('cleanup-selected', { transaction: transactionId(tx) });
        const cleanupEventTarget = cleanupCompleteOnDatabase ? tx.db : tx;
        const onCleanupComplete = event => {
          const detail = { transaction: transactionId(tx),
            targetTransaction: event.target instanceof IDBTransaction ? transactionId(event.target) : null,
            targetMatches: event.target === tx, currentTargetIsDatabase: event.currentTarget === tx.db,
            trusted: event.isTrusted, eventPhase: event.eventPhase, capture: cleanupCompleteCapture };
          if (event.target !== tx || !event.isTrusted) {
            proof.ignoredCleanupCompletions++;
            trace('cleanup-complete-ignored', { ...detail, listenerAttached: proof.cleanupCompleteListenerAttached });
            return;
          }
          trace('cleanup-complete-listener-enter', detail); proof.cleanupCommitted = true; trace('cleanup-complete-flag-set', detail);
          removeCleanupCompleteListener('matched-native-complete');
        };
        const onCleanupAbort = () => {
          proof.cleanupAborted = true; trace('cleanup-abort-listener', { transaction: transactionId(tx) });
          removeCleanupCompleteListener('selected-transaction-abort');
        };
        removeCleanupCompleteListener = reason => {
          if (!proof.cleanupCompleteListenerAttached) return;
          cleanupEventTarget.removeEventListener('complete', onCleanupComplete, cleanupCompleteCapture);
          tx.removeEventListener('abort', onCleanupAbort);
          proof.cleanupCompleteListenerAttached = false;
          trace('cleanup-complete-listener-removed', { transaction: transactionId(tx), reason });
        };
        // Do not use once: an unrelated native transaction must not consume this listener.
        cleanupEventTarget.addEventListener('complete', onCleanupComplete, { capture: cleanupCompleteCapture });
        tx.addEventListener('abort', onCleanupAbort, { once: true });
        proof.cleanupCompleteListenerAttached = true;
        trace('cleanup-complete-listener-attached', { transaction: transactionId(tx), onDatabase: cleanupCompleteOnDatabase });
        if (mode === 'abort') queueMicrotask(() => tx.abort());
        else if (mode === 'hold') {
          let held = true;
          const keepOpen = () => {
            const pending = tx.objectStore('meta').get('__synthetic_cleanup_hold__');
            pending.onsuccess = () => { if (held) keepOpen(); };
          };
          keepOpen();
          window.__abortAckCleanup = () => { held = false; tx.abort(); };
        }
      }
      return request;
    };
    IDBObjectStore.prototype.getAll = function(...args) {
      const request = getAll.apply(this, args), tx = this.transaction;
      if (this.name === 'records') {
        const transaction = transactionId(tx);
        trace('records-getAll', { transaction, sameCleanupConnection: tx.db === cleanupDatabase,
          caller: String(new Error('records read diagnostic').stack || '').slice(0, 4000) });
        request.addEventListener('success', () => trace('records-read-success', { transaction }), { once: true });
        request.addEventListener('error', () => trace('records-read-error', { transaction, error: request.error?.name || null }), { once: true });
        tx.addEventListener('complete', () => trace('records-read-transaction-complete', { transaction }), { once: true });
        tx.addEventListener('abort', () => trace('records-read-transaction-abort', { transaction, error: tx.error?.name || null }), { once: true });
      }
      if (mode === 'refresh' && this.name === 'records' && tx.db === cleanupDatabase && proof.cleanupCommitted && !proof.refreshStarted) {
        proof.refreshStarted = true;
        trace('refresh-fault-selected', { transaction: transactionId(tx) });
        tx.addEventListener('abort', event => { proof.refreshAborted = true; trace('refresh-abort-flag-set', { transaction: transactionId(tx), trusted: event.isTrusted, eventPhase: event.eventPhase }); }, { once: true });
        queueMicrotask(() => {
          trace('refresh-abort-microtask', { transaction: transactionId(tx) });
          try { tx.abort(); trace('refresh-abort-returned', { transaction: transactionId(tx) }); }
          catch (error) { trace('refresh-abort-threw', { transaction: transactionId(tx), error: error.name, message: error.message }); throw error; }
        });
      }
      return request;
    };
  }, settings);
}
async function waitForFollowupNotice(target, prefix) {
  await target.waitForFunction(expected => document.querySelector('.br-body .br-notice')?.textContent.startsWith(expected), prefix);
  return target.locator('.br-body .br-notice').innerText();
}
async function ackCleanupSnapshot(target) {
  // Memory/DOM only: a records read here could consume an unselected native fault.
  return target.evaluate(() => {
    const notice = document.querySelector('.br-body .br-notice');
    return { proof: window.__ackCleanupProof ? structuredClone(window.__ackCleanupProof) : null,
      notice: notice?.textContent ?? null, noticeHidden: notice?.hidden ?? null,
      liveNotice: document.querySelector('#br-live')?.textContent ?? null,
      editableFollowup: document.querySelector('#br-follow')?.value ?? null,
      pendingNotice: document.querySelector('.br-pending')?.textContent ?? null };
  });
}
function ackCleanupDurable(state, reportId, pointer) {
  const row = state.records.find(item => item.id === reportId);
  const key = reportId && pointer ? `followup:${reportId}:https://reports.bunki.test:${pointer}` : null;
  const draft = state.drafts.find(item => item.key === key), pending = draft?.value?.pending?.data;
  const hash = value => value == null ? null : createHash('sha256').update(value).digest('hex');
  return { reportId: reportId ?? null, receivedViewDurable: Boolean(row?.view?.receipt), pointer: pointer ?? null,
    draftKey: key, draftExists: Boolean(draft), revision: draft?.revision ?? null,
    nextDraftText: draft?.value?.text ?? null, nextDraftTextSha256: hash(draft?.value?.text),
    pendingPresent: Boolean(draft?.value?.pending), pendingKeySha256: hash(pending?.idempotency_key),
    pendingBodySha256: hash(pending ? JSON.stringify(pending) : null) };
}
async function verifyFollowupAckCleanup(target, holdFollowup) {
  const cleanupFailure = 'Your follow-up was received. This device could not finish saving the updated draft.';
  for (const mode of ['abort', 'hold', 'refresh']) {
    stage = `followup-ack-cleanup-${mode}`;
    const sentText = `ACK ${mode}: one logical received follow-up.`, draftText = `Draft B ${mode}: retained after ACK.`, laterText = `Draft C ${mode}: entered while cleanup was pending.`;
    const countBefore = followCount, held = holdFollowup();
    let frozenBody, frozenKey, modeError = null, modePassed = false;
    let faultSnapshot = null, failureSnapshot = null, durableBeforeReload = null, durableAfterRetry = null;
    const hash = value => value == null ? null : createHash('sha256').update(value).digest('hex');
    try {
      await target.locator('#br-follow').fill(sentText);
      await target.getByRole('button', { name: 'Send follow-up', exact: true }).click();
      let arrivalDeadline;
      try {
        await Promise.race([held.reached, new Promise((_, reject) => {
          arrivalDeadline = setTimeout(() => reject(new Error('The ACK cleanup fixture follow-up never reached its synthetic service.')), 10000);
        })]);
      } finally { clearTimeout(arrivalDeadline); }
      frozenBody = followupBodies.at(-1);
      frozenKey = JSON.parse(frozenBody).idempotency_key;
      await target.locator('#br-follow').fill(draftText);
      await waitForDraftText(target, draftText);
      await installAckCleanupFault(target, { sentText, draftText, laterText, mode });
      held.release('success');
      await target.waitForFunction(() => window.__ackCleanupProof.cleanupStarted);
      assert.equal(await target.evaluate(() => window.__ackCleanupProof.receiptCommitted), true, 'Cleanup fault follows the actual received-view records commit');
      if (mode === 'hold') {
        assert.equal(await target.evaluate(() => window.__ackCleanupProof.cleanupCommitted || window.__ackCleanupProof.cleanupAborted), false);
        await target.locator('#br-follow').fill(laterText);
        assert.equal(await target.locator('#br-follow').inputValue(), laterText);
        await target.evaluate(() => window.__abortAckCleanup());
      }
      const notice = await waitForFollowupNotice(target, mode === 'refresh' ? 'Your follow-up was received. This report could not be refreshed.' : cleanupFailure);
      assert.doesNotMatch(notice, /Retry it with the button|pending follow-up is kept|service did not reply in time/i, 'A post-ACK local failure cannot claim a network timeout or a nonexistent pending retry');
      assert.equal(await target.getByRole('button', { name: 'Retry pending follow-up', exact: true }).count(), 0, 'Session knowledge keeps the acknowledged request cleared');
      await target.waitForFunction(mode => mode === 'refresh' ? window.__ackCleanupProof.refreshAborted : window.__ackCleanupProof.cleanupAborted, mode);
      const proof = await target.evaluate(() => window.__ackCleanupProof);
      assert.equal(proof.cleanupCount, 1, 'Only one cleanup checkpoint was selected');
      assert.equal(proof.cleanupCompleteListenerAttached, false, 'Completion or abort removes the selected cleanup listener');
      const ignoredCompletions = proof.events.filter(event => event.event === 'cleanup-complete-ignored');
      assert.equal(ignoredCompletions.length, proof.ignoredCleanupCompletions);
      for (const ignored of ignoredCompletions) {
        assert(ignored.targetMatches === false || ignored.trusted === false, 'Only nonmatching or untrusted completion is ignored');
        assert.equal(ignored.cleanupCommitted, false, 'Ignored completion cannot establish selected cleanup commit');
        assert.equal(ignored.listenerAttached, true, 'Ignored completion cannot consume the selected listener');
      }
      if (mode === 'refresh') {
        assert.equal(proof.cleanupCommitted, true);
        assert.equal(proof.cleanupAborted, false);
        assert.equal(proof.refreshAborted, true, 'Only the post-cleanup native records read was aborted');
        assert.doesNotMatch(notice, /could not finish saving the updated draft|copy any unsent text/i);
        assert.equal(proof.droppedEvents, 0, 'The native ordering proof must not omit events');
        const cleanup = proof.events.find(event => event.event === 'cleanup-complete-flag-set');
        const selected = proof.events.find(event => event.event === 'refresh-fault-selected');
        const read = proof.events.find(event => event.event === 'records-getAll' && event.transaction === selected?.transaction);
        const aborted = proof.events.find(event => event.event === 'refresh-abort-flag-set' && event.transaction === selected?.transaction);
        assert(cleanup && read && selected && aborted, 'Retain native completion, selected read and abort observations');
        assert(cleanup.sequence < read.sequence && read.sequence < selected.sequence && selected.sequence < aborted.sequence,
          'Native cleanup completion must be observed before the selected records read and its native abort');
        assert.equal(cleanup.trusted, true); assert.equal(aborted.trusted, true);
        assert.equal(cleanup.eventPhase, 1, 'Observe native complete in the database ancestor capture phase');
        assert.equal(cleanup.currentTargetIsDatabase, true);
        assert.equal(cleanup.targetMatches, true); assert.equal(cleanup.targetTransaction, cleanup.transaction);
        const installation = proof.events.find(event => event.event === 'cleanup-complete-listener-attached');
        assert.equal(installation?.transaction, cleanup.transaction);
        assert(installation.sequence < cleanup.sequence, 'Install the observer before native completion');
        assert.equal(read.sameCleanupConnection, true, 'Abort the records read on the selected cleanup connection');
        const removal = proof.events.find(event => event.event === 'cleanup-complete-listener-removed');
        assert.equal(removal?.reason, 'matched-native-complete');
        assert(cleanup.sequence < removal.sequence && removal.sequence < read.sequence,
          'Remove the selected listener before the application refresh read');
        assert.equal(cleanup.transaction, proof.events.find(event => event.event === 'cleanup-selected')?.transaction);
        assert.notEqual(cleanup.transaction, selected.transaction, 'Cleanup write and aborted refresh read are distinct native transactions');
        assert.match(read.caller, /refreshRows/); assert.match(read.caller, /followup/);
        const cleanupTransaction = proof.transactions.find(tx => tx.id === cleanup.transaction);
        assert.equal(cleanupTransaction?.mode, 'readwrite'); assert.deepEqual(cleanupTransaction?.stores, ['meta']);
        const selectedTransaction = proof.transactions.find(tx => tx.id === selected.transaction);
        assert.equal(selectedTransaction?.mode, 'readonly');
        assert.deepEqual(selectedTransaction?.stores, ['records']);
        assert.equal(selectedTransaction?.database, 'bunki-maintenance-reports-v1');
        assert.equal(cleanupTransaction?.database, selectedTransaction.database);
        assert.equal(proof.events.some(event => event.transaction === selected.transaction && ['records-read-success', 'records-read-transaction-complete'].includes(event.event)), false,
          'The selected refresh transaction must not succeed');
      } else {
        assert.equal(proof.cleanupAborted, true, 'The real IndexedDB cleanup transaction aborted');
        assert.equal(proof.cleanupCommitted, false);
      }
      const expectedText = mode === 'hold' ? laterText : draftText;
      assert.equal(await target.locator('#br-follow').inputValue(), expectedText, 'An ACK cleanup await cannot overwrite newer editable text');
      if (mode === 'hold') {
        await target.waitForFunction(() => window.__ackCleanupProof.laterCommitted);
        await waitForDraftText(target, laterText);
      }
      let state = await localState(target);
      const receivedRow = state.records.find(row => row.view?.conversation?.some(item => item.actor === 'user' && item.text === sentText));
      assert(receivedRow?.view?.receipt, 'The acknowledged view remains durably saved despite later local failure');
      const draftPointer = await target.evaluate(reportId => sessionStorage.getItem(`bunki-reports-editor:followup:${reportId}:https://reports.bunki.test`), receivedRow.id);
      durableBeforeReload = ackCleanupDurable(state, receivedRow.id, draftPointer);
      assert(draftPointer, 'The current follow-up has a persistent recovery pointer');
      const durableDraft = state.drafts.find(row => row.key === `followup:${receivedRow.id}:https://reports.bunki.test:${draftPointer}`);
      assert(durableDraft, 'The current next draft has a native durable copy');
      assert.equal(durableDraft.value.text, expectedText, 'The current recovery pointer preserves the exact next text');
      if (mode === 'abort') {
        assert.equal(durableDraft.value.pending?.data.idempotency_key, frozenKey, 'The aborted cleanup leaves the original pending request as a reload recovery hint');
        assert.equal(JSON.stringify(durableDraft.value.pending.data), frozenBody, 'Durable recovery data preserves the exact request body');
      } else assert.equal(durableDraft.value.pending, undefined, 'A successful later C checkpoint or successful cleanup removes pending durably');
      assert.equal(followCount, countBefore + 1);
      assert.equal(followupBodies.filter(body => body === frozenBody).length, 1);
      faultSnapshot = await ackCleanupSnapshot(target); // Retain this proof before the planned reload clears the window.
      await target.reload(); await openFirstReport(target);
      assert.equal(await target.locator('#br-follow').inputValue(), expectedText);
      if (mode === 'abort') {
        await target.getByRole('button', { name: 'Retry pending follow-up', exact: true }).click();
        await waitForFollowupNotice(target, 'Your follow-up was received.');
        assert.equal(followupBodies.at(-1), frozenBody);
        assert.equal(followupBodies.filter(body => body === frozenBody).length, 2, 'Reload recovery replays the same request exactly once');
        assert.equal(followCount, countBefore + 1, 'Retry does not create another logical A in the synthetic service');
        assert.equal(await target.locator('#br-follow').inputValue(), draftText);
        state = await localState(target);
        const currentId = await target.evaluate(reportId => sessionStorage.getItem(`bunki-reports-editor:followup:${reportId}:https://reports.bunki.test`), receivedRow.id);
        assert(currentId, 'Retry retains a current recovery pointer');
        const cleanedDraft = state.drafts.find(row => row.key === `followup:${receivedRow.id}:https://reports.bunki.test:${currentId}`);
        durableAfterRetry = ackCleanupDurable(state, receivedRow.id, currentId);
        assert(cleanedDraft, 'The recovered current draft exists after retry');
        assert.equal(cleanedDraft.value.text, draftText);
        assert.equal(cleanedDraft.value.pending, undefined, 'The recovered current draft finishes cleanup');
      }
      assert.equal(await target.locator('.br-pending').count(), 0);
      assert.equal([...received.values()][0].conversation.filter(item => item.actor === 'user' && item.text === sentText).length, 1, 'A was received once logically');
      modePassed = true;
    } catch (error) {
      modeError = { name: error.name, message: error.message, stack: error.stack };
      // Capture only memory/DOM before finally aborts a held transaction or restores prototypes.
      // Do not read IndexedDB here: that could consume the very records-read fault under diagnosis.
      const diagnostic = { format: 'bunki-followup-ack-cleanup-failure', v: 1, stage, mode,
        capturePhase: 'before-fault-finally', browser: engineIdentity, source: sourceIdentity,
        verifierSha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
        error: modeError, snapshot: null, priorFaultSnapshot: faultSnapshot, durableBeforeReload,
        expected: { nextDraftText: mode === 'hold' ? laterText : draftText, pendingKeySha256: hash(frozenKey), requestBodySha256: hash(frozenBody) } };
      try {
        failureSnapshot = diagnostic.snapshot = await ackCleanupSnapshot(target);
      } catch (captureError) { diagnostic.captureError = { name: captureError.name, message: captureError.message }; }
      const path = `ack-cleanup-failure-${mode}.json`;
      try {
        const bytes = JSON.stringify(diagnostic, null, 2) + '\n';
        writeFileSync(resolve(out, path), bytes);
        ackCleanupFailure = { path, sha256: createHash('sha256').update(bytes).digest('hex'), capturePhase: diagnostic.capturePhase };
      } catch (writeError) {
        ackCleanupFailure = { path, writeError: { name: writeError.name, message: writeError.message } };
        console.error('Could not persist ACK cleanup diagnostic:', writeError.message);
      }
      throw error;
    } finally {
      held.release('success');
      const restoration = await target.evaluate(() => {
        if (window.__ackCleanupProof?.cleanupStarted && !window.__ackCleanupProof.cleanupAborted && !window.__ackCleanupProof.cleanupCommitted) window.__abortAckCleanup?.();
        window.__restoreAckCleanupFault?.();
        return { faultPresent: Boolean(window.__ackCleanupProof), restored: window.__ackCleanupProof?.restored ?? null };
      }).catch(error => ({ error: { name: error.name, message: error.message } }));
      let durableAfterFailureRestoration = null;
      if (modeError && failureSnapshot?.proof && restoration.restored === true) {
        // This is explicitly after fault restoration; it cannot select/consume the refresh fault.
        // It may include finally's deliberate abort of a held cleanup, so it is not an at-failure snapshot.
        try {
          const saved = await localState(target);
          const row = saved.records.find(item => item.view?.conversation?.some(item => item.actor === 'user' && item.text === sentText));
          const pointer = row ? await target.evaluate(reportId => sessionStorage.getItem(`bunki-reports-editor:followup:${reportId}:https://reports.bunki.test`), row.id) : null;
          durableAfterFailureRestoration = { phase: 'after-fault-restoration', ...ackCleanupDurable(saved, row?.id, pointer) };
        } catch (error) { durableAfterFailureRestoration = { phase: 'after-fault-restoration', captureError: { name: error.name, message: error.message } }; }
      }
      const evidencePassed = modePassed && !restoration.error;
      const receipt = { format: 'bunki-followup-ack-cleanup-mode', v: 1, mode, passed: evidencePassed, browser: engineIdentity,
        source: sourceIdentity, verifierSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
        expected: { nextDraftText: mode === 'hold' ? laterText : draftText, pendingKeySha256: hash(frozenKey), requestBodySha256: hash(frozenBody) },
        faultSnapshot, failureSnapshot, durableBeforeReload, durableAfterRetry, durableAfterFailureRestoration, restoration,
        error: modeError, logicalFollowupDelta: followCount - countBefore,
        identicalWireAttempts: frozenBody ? followupBodies.filter(body => body === frozenBody).length : 0 };
      const path = `ack-cleanup-${mode}.json`;
      try {
        const bytes = JSON.stringify(receipt, null, 2) + '\n';
        writeFileSync(resolve(out, path), bytes);
        ackCleanupEvidence.push({ mode, passed: evidencePassed, path, sha256: hash(bytes) });
      } catch (error) {
        ackCleanupEvidence.push({ mode, passed: false, path, writeError: { name: error.name, message: error.message } });
        if (!modeError) throw error;
        console.error('Could not persist ACK cleanup mode evidence:', error.message);
      }
      if (modePassed && restoration.error) throw new Error(`ACK cleanup fixture restoration failed: ${restoration.error.message}`);
    }
  }
}

async function verifyFollowupOwnerIsolation(target) {
  const original = await target.locator('#br-follow').inputValue();
  await waitForDraftText(target, original);
  const copiedSession = await target.evaluate(() => Object.entries(sessionStorage));
  const duplicate = await context.newPage();
  duplicate.on('pageerror', error => errors.push(error.message));
  try {
    await duplicate.addInitScript(entries => { for (const [key, value] of entries) if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value); }, copiedSession);
    await duplicate.goto('https://bunki.test'); await openFirstReport(duplicate);
    assert.equal(await duplicate.locator('#br-follow').inputValue(), original);
    await duplicate.locator('#br-follow').fill('Other tab follow-up: writes first at the same revision.');
    await waitForDraftText(duplicate, 'Other tab follow-up: writes first at the same revision.');
    await target.reload(); await openFirstReport(target);
    assert.equal(await target.locator('#br-follow').inputValue(), original, 'An equal-revision duplicate must preserve the original follow-up owner');
    const state = await localState(target);
    const own = state.drafts.find(row => row.value.text === original), other = state.drafts.find(row => row.value.text === 'Other tab follow-up: writes first at the same revision.');
    assert(own && other); assert.notEqual(own.key, other.key);
  } finally { await duplicate.close(); }
}
async function remountFixture(target) {
  await target.evaluate(() => {
    window.fixture = window.BunkiReports.mount({ serviceUrl: 'https://reports.bunki.test', getContext: () => ({ surface: 'test/explanation', route: '/question/2', content_ids: ['fixture:q2'] }) });
  });
  await openFirstReport(target);
}
async function verifyFollowupUnmount(target, holdFollowup) {
  await target.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    window.__restoreDraftTransaction = () => { IDBDatabase.prototype.transaction = transaction; };
    IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
      const tx = transaction.call(this, stores, mode, ...rest), names = typeof stores === 'string' ? [stores] : [...stores];
      if (mode === 'readwrite' && names.length === 1 && names[0] === 'meta') {
        tx.addEventListener('complete', () => { window.__draftNativeAcks = (window.__draftNativeAcks || 0) + 1; });
        if (window.__rejectDraftWrites) queueMicrotask(() => tx.abort());
        else if (window.__holdDraftAck) {
          window.__draftWriteStarted = true;
          const keepOpen = () => { const r = tx.objectStore('meta').get('__synthetic_hold__'); r.onsuccess = () => { if (window.__holdDraftAck) keepOpen(); }; };
          keepOpen();
        }
      }
      return tx;
    };
  });
  const held = holdFollowup();
  try {
    await target.locator('#br-follow').fill('Accepted follow-up: its ACK is pending during unmount.');
    await target.getByRole('button', { name: 'Send follow-up', exact: true }).click();
    await held.reached;
    await target.evaluate(() => { window.__holdDraftAck = true; window.__draftWriteStarted = false; });
    await target.locator('#br-follow').fill('Queued next draft one.');
    await target.waitForFunction(() => window.__draftWriteStarted);
    await target.locator('#br-follow').fill('Queued next draft two.');
    await target.locator('#br-follow').fill('Newest next draft: retain through unmount.');
    await target.evaluate(() => {
      window.__unmountState = 'pending';
      window.__unmountTask = window.fixture.unmount().then(() => { window.__unmountState = 'fulfilled'; }, error => { window.__unmountState = 'rejected'; window.__unmountError = error.message; });
    });
    assert.equal(await target.evaluate(() => window.__unmountState), 'pending', 'Unmount cannot finish ahead of accepted native writes and network ACK');
    await target.getByText('Finishing report saves before closing. Your text is protected while this finishes.', { exact: true }).waitFor();
    // A native showModal dialog escapes ancestor inertness. Exercise the real
    // focused control with keyboard events, rather than trusting root.inert.
    await target.locator('#br-follow').focus();
    await target.keyboard.press('End');
    await target.keyboard.type(' This must not change the closing draft.');
    await target.keyboard.press('Backspace');
    assert.equal(await target.locator('#br-follow').inputValue(), 'Newest next draft: retain through unmount.', 'The modal textarea itself must reject keyboard edits during the held unmount');
    await target.keyboard.press('Escape');
    assert.equal(await target.evaluate(() => document.querySelector('.br-sheet').open), true, 'The saving status stays available while unmount is pending');

    await target.evaluate(() => { window.__holdDraftAck = false; });
    await waitForDraftText(target, 'Newest next draft: retain through unmount.');
    assert.equal(await target.evaluate(() => window.__unmountState), 'pending', 'Draining only the current queue is insufficient while a follow-up ACK can enqueue cleanup');
    held.release('success');
    await target.waitForFunction(() => window.__unmountState !== 'pending');
    assert.equal(await target.evaluate(() => window.__unmountState), 'fulfilled');
    assert.equal(await target.locator('#bunki-reports-root').count(), 0);
    assert((await target.evaluate(() => window.__draftNativeAcks)) >= 3, 'Native IndexedDB completions were observed');
    await remountFixture(target);
    assert.equal(await target.locator('#br-follow').inputValue(), 'Newest next draft: retain through unmount.');
    assert.equal(await target.locator('.br-pending').count(), 0);

    // A failed final checkpoint must reject unmount and keep the exact editor.
    await target.evaluate(() => {
      window.__rejectDraftWrites = true; window.__unmountState = 'pending';
      window.__unmountTask = window.fixture.unmount().then(() => { window.__unmountState = 'fulfilled'; }, error => { window.__unmountState = 'rejected'; window.__unmountError = error.message; });
    });
    await target.waitForFunction(() => window.__unmountState !== 'pending');
    assert.equal(await target.evaluate(() => window.__unmountState), 'rejected');
    assert.equal(await target.locator('#bunki-reports-root').count(), 1);
    assert.equal(await target.evaluate(() => document.querySelector('#bunki-reports-root').inert), false);
    assert.equal(await target.locator('#br-follow').inputValue(), 'Newest next draft: retain through unmount.');
    await target.evaluate(() => { window.__rejectDraftWrites = false; });
    await target.locator('#br-follow').fill('Editing works after a rejected unmount.');
    await target.keyboard.press('End');
    await target.keyboard.type(' Keyboard entry also works.');
    assert.equal(await target.locator('#br-follow').inputValue(), 'Editing works after a rejected unmount. Keyboard entry also works.', 'Rejected unmount restores actual keyboard editing');
    await waitForDraftText(target, 'Editing works after a rejected unmount. Keyboard entry also works.');
    await target.evaluate(() => window.fixture.unmount());
    await remountFixture(target);
    assert.equal(await target.locator('#br-follow').inputValue(), 'Editing works after a rejected unmount. Keyboard entry also works.');
  } finally {
    held.release('success');
    await target.evaluate(() => { window.__holdDraftAck = false; window.__rejectDraftWrites = false; window.__restoreDraftTransaction?.(); }).catch(() => {});
  }
}
async function verifyAttachmentRecovery(png) {
  const isolated = await fixtureContext({ init: () => {
    const decode = window.createImageBitmap;
    window.createImageBitmap = async (...args) => {
      const bitmap = await decode(...args);
      if (window.__holdBitmap) await new Promise(resolve => { window.__bitmapValidated = true; window.__releaseBitmap = resolve; });
      return bitmap;
    };
  } });
  try {
    const full = await isolated.newPage(); await openDraft(full);
    await full.locator('#br-actual').fill('Full saved draft: keep its four original screenshots.');
    await full.locator('#br-files').setInputFiles(Array.from({ length: 4 }, (_, index) => ({ name: `full-${index}.png`, mimeType: 'image/png', buffer: png })));
    await full.waitForFunction(() => document.querySelectorAll('.br-attachments img').length === 4);
    const before = (await localState(full)).drafts.find(row => row.value.actual === 'Full saved draft: keep its four original screenshots.');
    const editing = await isolated.newPage(); await openDraft(editing);
    await editing.locator('#br-actual').fill('Attachment belongs to this draft only.');
    await editing.getByText('Recover saved reports', { exact: true }).click();
    await editing.evaluate(() => { window.__holdBitmap = true; });
    await editing.locator('#br-files').setInputFiles({ name: 'pending-other-draft.png', mimeType: 'image/png', buffer: png });
    await editing.waitForFunction(() => window.__bitmapValidated);
    const recovery = editing.locator(`[data-br="recover-draft"][data-id="${before.key}"]`);
    assert.equal(await recovery.isDisabled(), true, 'Recovery cannot switch drafts while an accepted screenshot is being validated');
    await editing.evaluate(() => { window.__holdBitmap = false; window.__releaseBitmap(); });
    await editing.waitForFunction(() => document.querySelectorAll('.br-attachments img').length === 1);
    await editing.getByText('Recover saved reports', { exact: true }).click();
    await recovery.click();
    await editing.getByText('Draft recovered. Its earlier saved copy is still available.', { exact: true }).first().waitFor();
    assert.equal(await editing.locator('.br-attachments img').count(), 4);
    assert.equal(await editing.locator('.br-attachments').innerText().then(text => text.includes('pending-other-draft')), false);
    assert.deepEqual((await localState(editing)).drafts.find(row => row.key === before.key).value.attachments, before.value.attachments);

    // Public close/open can replace an empty draft while decoding is pending.
    // The validated file must then be rejected instead of attached to its successor.
    const blank = await isolated.newPage(); await openDraft(blank);
    await blank.evaluate(() => { window.__holdBitmap = true; });
    await blank.locator('#br-files').setInputFiles({ name: 'old-empty-draft.png', mimeType: 'image/png', buffer: png });
    await blank.waitForFunction(() => window.__bitmapValidated);
    await blank.evaluate(async () => { window.fixture.close(); await window.fixture.openReport(); window.__holdBitmap = false; window.__releaseBitmap(); });
    await blank.getByText('The draft changed while checking the screenshots. No files were added; select them again in this draft.', { exact: true }).first().waitFor();
    assert.equal(await blank.locator('.br-attachments img').count(), 0);
  } finally { await isolated.close(); }
}

async function localState(target) {
  return target.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('bunki-maintenance-reports-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try {
      const read = store => new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const meta = await read('meta'), records = await read('records');
      const describe = async item => ({ id: item.id, name: item.name, bytes: item.blob.size, sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await item.blob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('') });
      const drafts = [];
      for (const row of meta) {
        if (!row.key.startsWith('draft:') && !row.key.startsWith('followup:')) continue;
        const value = row.value.draft_id ? row.value.draft : row.value;
        drafts.push({ key: row.key, revision: row.value.revision, value: { ...value, attachments: await Promise.all((value.attachments || []).map(describe)) } });
      }
      return { drafts, records, attachments: await Promise.all((await read('attachments')).map(describe)) };
    } finally { db.close(); }
  });
}
// Await the resolved predicate in Node. Playwright 1.63's waitForFunction truth-tests
// an async predicate's Promise before resolution, so async false can stop its poll.
async function pollNativeState(check, { timeoutMs, description, intervalMs = 50 }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(intervalMs) || intervalMs <= 0)
    throw new TypeError('Native-state polling requires positive finite bounds');
  const deadline = performance.now() + timeoutMs;
  const timeoutError = new Error(`Timed out after ${timeoutMs}ms waiting for ${description}`);
  timeoutError.name = 'TimeoutError';
  let deadlineTimer, intervalTimer;
  const expired = new Promise((resolve, reject) => { deadlineTimer = setTimeout(() => reject(timeoutError), timeoutMs); });
  try {
    while (true) {
      if (performance.now() >= deadline) throw timeoutError;
      // evaluate has no Playwright timeout; bound even an evaluation that never settles.
      const observed = await Promise.race([Promise.resolve().then(check), expired]);
      if (performance.now() >= deadline) throw timeoutError;
      if (observed === true) return;
      if (observed !== false) throw new TypeError('Native-state predicate must resolve to a boolean');
      await Promise.race([new Promise(resolve => {
        intervalTimer = setTimeout(resolve, Math.min(intervalMs, Math.max(0, deadline - performance.now())));
      }), expired]);
    }
  } finally { clearTimeout(deadlineTimer); clearTimeout(intervalTimer); }
}
async function readReportStoreRows(target, store) {
  return target.evaluate(async storeName => {
    let db;
    try {
      db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('bunki-maintenance-reports-v1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Report fixture database open failed'));
      });
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).getAll();
        let rows;
        request.onsuccess = () => { rows = request.result; };
        request.onerror = () => reject(request.error || new Error('Report fixture getAll failed'));
        tx.onerror = () => reject(tx.error || request.error || new Error('Report fixture read transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('Report fixture read transaction aborted'));
        tx.oncomplete = () => Array.isArray(rows) ? resolve(rows) : reject(new Error('Report fixture read returned no rows array'));
      });
    } finally { db?.close(); }
  }, store);
}
async function waitForDraftText(target, text) {
  await pollNativeState(async () => {
    const rows = await readReportStoreRows(target, 'meta');
    return rows.some(row => { const value = row.value?.draft_id ? row.value.draft : row.value; return value?.actual === text || value?.text === text; });
  }, { timeoutMs: target === page ? 10000 : 30000, description: 'persisted report draft text' });
}
async function openFirstReport(target) {
  await target.evaluate(() => window.fixture.ready);
  await target.evaluate(() => window.fixture.openReports());
  await target.locator('[data-br="detail"]').first().click();
  await target.locator('#br-follow').waitFor();
  await target.getByRole('button', { name: 'Refresh & retry', exact: true }).waitFor();
  await target.waitForFunction(() => !document.querySelector('[data-br="refresh"]')?.disabled);
}
async function fixtureContext({ config, init } = {}) {
  const isolated = await browser.newContext();
  isolated.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await isolated.addInitScript(() => {
    const json = Response.prototype.json;
    Response.prototype.json = async function(...args) {
      const value = await json.apply(this, args);
      if (this.url.endsWith('/api/config')) window.__fixtureConfigConsumed = true;
      return value;
    };
  });
  if (init) await isolated.addInitScript(init);
  await isolated.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === 'bunki.test' && request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: html });
    const headers = { 'Access-Control-Allow-Origin': 'https://bunki.test', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/api/config' && config) return route.fulfill({ contentType: 'application/json', headers, body: JSON.stringify(config) });
    return route.fulfill({ status: 404, headers, contentType: 'application/json', body: '{}' });
  });
  return isolated;
}
async function openDraft(target) {
  await target.goto('https://bunki.test');
  await target.evaluate(() => window.fixture.ready);
  await target.evaluate(() => window.fixture.openReport());
}
async function verifyIndependentDrafts(png) {
  const isolated = await fixtureContext();
  try {
    const first = await isolated.newPage(), second = await isolated.newPage();
    await openDraft(first); await openDraft(second);
    await first.locator('#br-actual').fill('Tab A: only submit this report.');
    await second.locator('#br-actual').fill('Tab B: keep these exact unsent words.');
    await second.locator('#br-expected').fill('Tab B expected result remains distinct.');
    await second.locator('#br-files').setInputFiles({ name: 'tab-b.png', mimeType: 'image/png', buffer: png });
    await second.locator('.br-attachments img').waitFor();
    await waitForDraftText(second, 'Tab B: keep these exact unsent words.');
    const before = (await localState(second)).drafts.find(row => row.value.actual === 'Tab B: keep these exact unsent words.');
    assert.equal(before.value.attachments.length, 1);
    await first.getByRole('button', { name: 'Send report', exact: true }).click();
    await first.getByRole('heading', { name: 'Saved on this device', exact: true }).waitFor();
    await second.reload(); await second.evaluate(() => window.fixture.ready); await second.evaluate(() => window.fixture.openReport());
    assert.equal(await second.locator('#br-actual').inputValue(), before.value.actual);
    assert.equal(await second.locator('#br-expected').inputValue(), before.value.expected);
    assert.equal(await second.locator('.br-attachments img').count(), 1);
    const after = (await localState(second)).drafts.find(row => row.key === before.key);
    assert.deepEqual(after.value.attachments, before.value.attachments, 'Submitting another tab cannot remove or change draft attachment bytes');

    // A copied tab writes FIRST at the exact revision loaded by its idle
    // original. Revision equality alone must not permit replacing that owner.
    const ownerSnapshot = await second.evaluate(() => Object.entries(sessionStorage));
    const firstWriter = await isolated.newPage();
    await firstWriter.addInitScript(entries => { for (const [key, value] of entries) if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value); }, ownerSnapshot);
    await openDraft(firstWriter);
    await firstWriter.locator('#br-actual').fill('Duplicate writes first: preserve the idle original.');
    await waitForDraftText(firstWriter, 'Duplicate writes first: preserve the idle original.');
    await second.reload(); await second.evaluate(() => window.fixture.ready); await second.evaluate(() => window.fixture.openReport());
    assert.equal(await second.locator('#br-actual').inputValue(), before.value.actual, 'Equal revision does not authorize another document to overwrite the idle original');
    assert.equal(await second.locator('#br-expected').inputValue(), before.value.expected);
    const untouched = (await localState(second)).drafts.find(row => row.key === before.key);
    assert.deepEqual(untouched.value.attachments, before.value.attachments);
    assert.equal(untouched.value.actual, before.value.actual);
    await firstWriter.close();

    // Browsers copy sessionStorage into duplicated/opener tabs. Exercise that
    // exact copied recovery pointer; it cannot serve as a shared ownership lock.
    const copiedSession = await second.evaluate(() => Object.entries(sessionStorage));
    const duplicate = await isolated.newPage();
    await duplicate.addInitScript(entries => { for (const [key, value] of entries) if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value); }, copiedSession);
    await openDraft(duplicate);
    assert.equal(await duplicate.locator('#br-actual').inputValue(), before.value.actual);
    await second.locator('#br-actual').fill('Tab B: edited after its duplicate opened.');
    await waitForDraftText(second, 'Tab B: edited after its duplicate opened.');
    await duplicate.locator('#br-actual').fill('Duplicate tab: a different recoverable draft.');
    await waitForDraftText(duplicate, 'Duplicate tab: a different recoverable draft.');
    const divergent = (await localState(second)).drafts;
    const originalDraft = divergent.find(row => row.value.actual === 'Tab B: edited after its duplicate opened.');
    const duplicatedDraft = divergent.find(row => row.value.actual === 'Duplicate tab: a different recoverable draft.');
    assert(originalDraft && duplicatedDraft);
    assert.notEqual(originalDraft.key, duplicatedDraft.key, 'A stale duplicate forks its own persistent identity');
    assert.deepEqual(duplicatedDraft.value.attachments, originalDraft.value.attachments);
    await duplicate.reload(); await duplicate.evaluate(() => window.fixture.ready); await duplicate.evaluate(() => window.fixture.openReport());
    assert.equal(await duplicate.locator('#br-actual').inputValue(), duplicatedDraft.value.actual);

    // A browser restart or lost sessionStorage can still recover orphan drafts.
    await second.close();
    const recovered = await isolated.newPage();
    await openDraft(recovered);
    await recovered.getByText('Recover saved reports', { exact: true }).click();
    await recovered.locator(`[data-br="recover-draft"][data-id="${originalDraft.key}"]`).click();
    await recovered.getByText('Draft recovered. Its earlier saved copy is still available.', { exact: true }).first().waitFor();
    assert.equal(await recovered.locator('#br-actual').inputValue(), originalDraft.value.actual);
    assert.equal(await recovered.locator('#br-expected').inputValue(), before.value.expected);
    assert.equal(await recovered.locator('.br-attachments img').count(), 1);
    assert((await localState(recovered)).drafts.some(row => row.key === originalDraft.key), 'Recovery does not consume the orphan copy');

    // Legacy shared-key data is copied, never deleted during migration or submit.
    await recovered.evaluate(async key => {
      const db = await new Promise(resolve => { const r = indexedDB.open('bunki-maintenance-reports-v1'); r.onsuccess = () => resolve(r.result); });
      try {
        const source = await new Promise(resolve => { const r = db.transaction('meta').objectStore('meta').get(key); r.onsuccess = () => resolve(r.result); });
        await new Promise((resolve, reject) => { const tx = db.transaction('meta', 'readwrite'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.objectStore('meta').put({ key: 'draft:https://reports.bunki.test', value: { ...source.value.draft, actual: 'Legacy report: retain original bytes.' } }); });
      } finally { db.close(); }
    }, originalDraft.key);
    const legacy = await isolated.newPage(); await openDraft(legacy);
    assert.equal(await legacy.locator('#br-actual').inputValue(), 'Legacy report: retain original bytes.');
    await legacy.getByRole('button', { name: 'Send report', exact: true }).click();
    await legacy.getByRole('heading', { name: 'Saved on this device', exact: true }).waitFor();
    const legacyCopy = (await localState(legacy)).drafts.find(row => row.key === 'draft:https://reports.bunki.test');
    assert.equal(legacyCopy.value.actual, 'Legacy report: retain original bytes.');
    assert.deepEqual(legacyCopy.value.attachments, before.value.attachments);
  } finally { await isolated.close(); }
}
async function verifyHostileConfig(png) {
  const isolated = await fixtureContext({ config: { limits: { attachment_count: '<img id="config-injected" src=x onerror="window.__reportConfigExecuted=true">', attachment_bytes: -1, total_attachment_bytes: Number.MAX_SAFE_INTEGER } } });
  try {
    const target = await isolated.newPage(); await openDraft(target);
    await target.waitForFunction(() => window.__fixtureConfigConsumed);
    await target.waitForFunction(() => document.querySelector('#br-file-note')?.textContent.includes('up to 4 images, 2 MB each'));
    assert.equal(await target.locator('#config-injected').count(), 0);
    assert.equal(await target.evaluate(() => window.__reportConfigExecuted === true), false);
    await target.locator('#br-files').setInputFiles(Array.from({ length: 5 }, (_, index) => ({ name: `limit-${index}.png`, mimeType: 'image/png', buffer: png })));
    await target.getByText('Choose at most 4 screenshots.', { exact: true }).first().waitFor();
    assert.equal(await target.locator('.br-attachments img').count(), 0);
    await target.locator('#br-files').setInputFiles({ name: 'oversized.png', mimeType: 'image/png', buffer: Buffer.alloc(2097153) });
    await target.getByText('Each screenshot must be at most 2 MB. No files were added.', { exact: true }).first().waitFor();
    assert.equal(await target.locator('.br-attachments img').count(), 0);
  } finally { await isolated.close(); }
}
async function verifyNoServiceDurability() {
  const isolated = await fixtureContext({ init: () => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
      const tx = transaction.call(this, stores, mode, ...rest), names = typeof stores === 'string' ? [stores] : [...stores];
      if (mode === 'readwrite' && names.includes('records') && names.includes('attachments')) {
        window.__reportTransactionStarted = true;
        tx.addEventListener('complete', () => { window.__reportTransactionAck = true; });
        if (window.__rejectReportCommit) queueMicrotask(() => tx.abort());
        else if (window.__holdReportCommit) {
          const keepOpen = () => { const r = tx.objectStore('records').get('__synthetic_hold__'); r.onsuccess = () => { if (window.__holdReportCommit) keepOpen(); }; };
          keepOpen();
        }
      }
      return tx;
    };
  } });
  try {
    const target = await isolated.newPage(); await openDraft(target);
    await target.getByText('This copy of KAIRO has no report service yet. You can save a report on this device; it will not be sent.', { exact: true }).waitFor();
    assert.equal(await target.getByRole('heading', { name: 'Saved on this device', exact: true }).count(), 0);
    assert.doesNotMatch(await target.locator('.br-body').innerText(), /Your report is saved on this device/);
    await target.locator('#br-actual').fill('No service: this report still needs a durable save.');
    await target.evaluate(() => { window.__rejectReportCommit = true; });
    await target.getByRole('button', { name: 'Send report', exact: true }).click();
    await target.getByText(/The report could not be saved\. Your draft is still here/).first().waitFor();
    assert.equal(await target.getByRole('heading', { name: 'Saved on this device', exact: true }).count(), 0);
    assert.equal((await localState(target)).records.length, 0);
    assert.equal(await target.locator('#br-actual').inputValue(), 'No service: this report still needs a durable save.');
    await target.evaluate(() => { window.__rejectReportCommit = false; window.__holdReportCommit = true; window.__reportTransactionStarted = false; });
    await target.getByRole('button', { name: 'Send report', exact: true }).click();
    await target.waitForFunction(() => window.__reportTransactionStarted);
    assert.equal(await target.getByRole('heading', { name: 'Saved on this device', exact: true }).count(), 0, 'An unacknowledged transaction cannot claim saved');
    assert.equal(await target.evaluate(() => window.__reportTransactionAck === true), false);
    await target.evaluate(() => { window.__holdReportCommit = false; });
    await target.getByRole('heading', { name: 'Saved on this device', exact: true }).waitFor();
    assert.equal(await target.evaluate(() => window.__reportTransactionAck), true, 'Saved UI follows the actual IndexedDB completion event');
    assert.equal((await localState(target)).records.length, 1);
    await target.getByText('Saved on this device. It has not been sent.', { exact: true }).first().waitFor();
  } finally { await isolated.close(); }
}

} catch (error) {
  terminalResult = { passed: false, stage, browser: engineIdentity, source: sourceIdentity || { path: sourcePath, sha256: null }, error: { name: error.name, message: error.message, stack: error.stack }, ackCleanupEvidence, ...(ackCleanupFailure ? { ackCleanupFailure } : {}), service_fixture: 'synthetic, no live AI' };
  writeFileSync(resolve(out, 'browser-results.json'), JSON.stringify(terminalResult, null, 2) + '\n');
  throw error;
} finally {
  try { await browser?.close(); }
  catch (error) {
    terminalResult = { ...terminalResult, passed: false, cleanup_error: { name: error.name, message: error.message, stack: error.stack } };
    writeFileSync(resolve(out, 'browser-results.json'), JSON.stringify(terminalResult, null, 2) + '\n');
    throw error;
  }
}
writeFileSync(resolve(out, 'browser-results.json'), JSON.stringify(terminalResult, null, 2) + '\n');
console.log(`Report client browser checks passed. Evidence: ${out}`);
