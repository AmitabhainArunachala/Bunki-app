/** Actual teacher UI in persistent Chromium/WebKit profiles. Native IndexedDB
 * is read only as output. Provider responses and fault timing, where named,
 * are explicit synthetic fixtures; no external request is allowed to leave. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';

assert(process.env.KAIRO_SITE_DIR && isAbsolute(process.env.KAIRO_SITE_DIR), 'Supply one immutable staged runtime explicitly');
const OUT = resolveCorridorEvidence(), SITE = resolveCorridorSite();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ENGINES = (process.env.KAIRO_BROWSER || 'all') === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER];
assert(ENGINES.every((engine) => ['chromium', 'webkit'].includes(engine)));
const FILTERS = new Set(process.argv.filter((arg) => arg.startsWith('--case=')).map((arg) => arg.slice(7)));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (value) => Array.isArray(value) ? value.map(normalize) : value !== null && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])])) : value;
const digest = (value) => sha(JSON.stringify(normalize(value)));
const manifest = JSON.parse(readFileSync(join(SITE, 'build-identity.json'), 'utf8'));
const retainedSite = join(OUT, 'tested-site');
cpSync(SITE, retainedSite, { recursive: true, errorOnExist: true, force: false });
for (const file of manifest.files) assert.equal(sha(readFileSync(join(retainedSite, file.path))), file.sha256);
const sourceCopies = [];
for (const path of ['prototypes/corridor/tools/verify-teacher-drafts.mjs', 'prototypes/corridor/tools/record-test-support.mjs',
  'prototypes/corridor/corridor.js', 'prototypes/corridor/teacher-context.mjs', 'prototypes/corridor/teacher-drafts.mjs',
  'prototypes/corridor/teacher-draft-controller.mjs',
  'prototypes/corridor/record-app.mjs', 'prototypes/corridor/record-host.mjs', 'prototypes/corridor/record-controller.mjs']) {
  if (!existsSync(join(ROOT, path))) continue;
  const bytes = readFileSync(join(ROOT, path)), file = join(OUT, 'source-copies', path);
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes); sourceCopies.push({ path, file, sha256: sha(bytes) });
}
const verifierSha256 = sha(readFileSync(new URL(import.meta.url)));
const FAKE_ORIGIN = 'https://teacher-drafts.synthetic.invalid';
const FAKE_KEY = 'synthetic-teacher-drafts-fixture-not-a-real-credential';
const FAKE_MODEL = 'synthetic-teacher-draft-regression';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/synthetic-local-recovery-fault') {
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }).end('<!doctype html><meta charset="utf-8"><h1>Explicit synthetic local draft recovery fault</h1><p>No native record writes or application reducers run on this fixture page.</p>'); return;
  }
  const file = resolve(retainedSite, pathname === '/' ? 'index.html' : pathname.slice(1));
  try {
    if (!file.startsWith(`${retainedSite}/`) || !statSync(file).isFile()) throw new Error('missing');
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const results = [], browserVersions = {}, startedAt = new Date().toISOString();
const definitions = [];
const define = (name, body, options = {}) => definitions.push({ name, body, ...options });

function deferred() {
  let resolvePromise;
  const promise = new Promise((done) => { resolvePromise = done; });
  return { promise, resolve: resolvePromise };
}
async function bounded(promise, description, timeout = 12000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, fail) => { timer = setTimeout(() => fail(new Error(`Timed out: ${description}`)), timeout); })]); }
  finally { clearTimeout(timer); }
}
function transportFor(fixture) {
  const state = { primary: [], mining: [], blocked: [], preflights: [], plans: [], gates: [] };
  state.plan = (value) => {
    const plan = { ...value, captured: deferred(), gate: deferred() }; state.plans.push(plan); state.gates.push(plan.gate);
    plan.release = () => plan.gate.resolve(); return plan;
  };
  state.releaseAll = () => state.gates.forEach((gate) => gate.resolve());
  state.install = async (context) => context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === ORIGIN) return route.continue();
    if (!fixture.synthetic || url.origin !== FAKE_ORIGIN || url.pathname !== '/v1/messages' || url.search || !['POST', 'OPTIONS'].includes(request.method())) {
      state.blocked.push({ origin: url.origin, pathname: url.pathname, method: request.method(), reason: 'outside synthetic provider scope' }); return route.abort();
    }
    const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,x-api-key,anthropic-version,anthropic-dangerous-direct-browser-access' };
    if (request.method() === 'OPTIONS') { state.preflights.push({ origin: url.origin, pathname: url.pathname }); return route.fulfill({ status: 204, headers: cors }); }
    const body = request.postDataJSON();
    if (request.headers()['x-api-key'] !== FAKE_KEY || body.model !== FAKE_MODEL || !Array.isArray(body.messages)) {
      state.blocked.push({ reason: 'unrecognized synthetic request shape or fixture credential' }); return route.abort();
    }
    const call = { origin: url.origin, pathname: url.pathname, credential: 'synthetic-matched', body };
    if (typeof body.system === 'string' && body.system.includes('observations about the LEARNER')) {
      state.mining.push(call);
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: '[]' }] }) });
    }
    const plan = state.plans.shift();
    if (!plan || body.messages.at(-1)?.role !== 'user' || body.messages.at(-1)?.content !== plan.question.trim()) {
      state.blocked.push({ reason: 'provider request without matching explicit learner send', body }); return route.abort();
    }
    call.contextRef = plan.contextRef || null; call.reply = plan.reply; call.status = plan.fail ? 503 : 200;
    state.primary.push(call); plan.captured.resolve(call); await plan.gate.promise;
    return route.fulfill({ status: call.status, headers: cors, contentType: 'application/json', body: JSON.stringify(plan.fail
      ? { error: { type: 'synthetic_unavailable', message: 'Explicit synthetic teacher failure' } }
      : { content: [{ type: 'text', text: plan.reply }] }) });
  });
  return state;
}
async function launch(fixture) {
  fixture.context = await ({ chromium, webkit }[fixture.engine]).launchPersistentContext(fixture.profile, {
    headless: true, viewport: { width: 1120, height: 1100 }, locale: 'en-US', serviceWorkers: 'block', acceptDownloads: true,
  });
  browserVersions[fixture.engine] = fixture.context.browser()?.version();
  await fixture.transport.install(fixture.context);
  fixture.page = fixture.context.pages()[0] || await fixture.context.newPage(); fixture.page.setDefaultTimeout(15000);
  fixture.page.on('pageerror', (error) => fixture.errors.push({ phase: fixture.phase, message: error.message, stack: error.stack }));
  fixture.opens += 1;
}
async function close(fixture) {
  if (!fixture.context) return;
  const context = fixture.context; fixture.context = null; await context.close();
}
async function ready(page, protectedState = false) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  if (!protectedState) assert.equal(await page.locator('#store-alert').isVisible(), false, 'Normal profile has a writable native record');
}
async function shelf(fixture, { protectedState = false } = {}) {
  await fixture.page.goto(`${ORIGIN}/index.html?entry=shelf&ui=bi`); await ready(fixture.page, protectedState);
  await fixture.page.waitForFunction(() => document.body.dataset.view === 'shelf');
}
async function tutor(fixture, options) {
  await shelf(fixture, options); await fixture.page.locator('#ai-link').click();
  await fixture.page.locator('#chat-input').waitFor({ state: 'visible' });
}
async function selectTopic(fixture, contextRef) {
  const select = fixture.page.locator('#teacher-context-select');
  if (!await select.count()) { assert.equal(contextRef, null); return; }
  await select.selectOption(contextRef || '');
  await fixture.page.waitForFunction((ref) => document.querySelector('#teacher-context-select')?.value === (ref || '') && !document.querySelector('#teacher-context-select')?.disabled, contextRef);
  await fixture.page.locator('#chat-input').waitFor({ state: 'visible' });
}
async function createTopic(fixture, { articleId = 'bunki-graded-n3-river', index = 0 } = {}) {
  await shelf(fixture);
  await fixture.page.locator(`[data-passage="${articleId}"] .shelf-open`).click();
  const token = fixture.page.locator(`#reader .tok[data-index="${index}"]`); await token.waitFor();
  const word = await token.getAttribute('data-word'); assert(word, 'Fixture chooses a real content word');
  await token.click(); await fixture.page.locator('#reader-teacher').click();
  await fixture.page.locator('#teacher-context-select').waitFor();
  await waitForAppRecord(fixture.page, (record) => record.teacherContexts?.entries.some((entry) => entry.sourceId === articleId && entry.index === index), { description: 'normal source-context save' });
  const native = await readAppRecordSnapshot(fixture.page);
  const topic = native.record.teacherContexts.entries.find((entry) => entry.sourceId === articleId && entry.index === index);
  assert(topic && topic.id === native.record.teacherContexts.activeRef); assert.equal(topic.target.id, word);
  await fixture.page.waitForFunction((id) => document.querySelector('#teacher-context-select')?.value === id, topic.id);
  fixture.observations.push({ name: 'normal-ui-source-topic', context: topic }); return topic;
}
async function configure(fixture) {
  const page = fixture.page;
  await page.locator('#ai-base-url').fill(FAKE_ORIGIN); await page.locator('#ai-model-input').fill(FAKE_MODEL);
  await page.locator('#ai-key-input').fill(FAKE_KEY); await page.locator('#ai-key-save').click();
  await tutor(fixture); await page.waitForFunction(() => document.querySelector('#chat-send')?.disabled === false);
}
async function screenshot(fixture, label) {
  const file = join(fixture.out, `${label}.png`); await fixture.page.screenshot({ path: file, fullPage: true });
  fixture.screenshots.push({ label, file, sha256: sha(readFileSync(file)) });
}
async function snapshot(fixture, label) {
  const state = await readAppRecordSnapshot(fixture.page);
  for (const row of state.rows) assert.equal(sha(row.text), row.sha256);
  const profile = JSON.parse(state.rows.find((row) => row.kind === 'profile').text);
  assert.equal(profile.revision, state.revision); assert.equal(profile.view.projection.scheduling, 'not-computed');
  const recovery = await fixture.page.evaluate((databaseName) => {
    const key = `kairo-teacher-draft-recovery-v1:${databaseName}`;
    const status = document.querySelector('#teacher-draft-status');
    return { key, text: localStorage.getItem(key), installationText: localStorage.getItem('kairo-local-record-binding-v1'),
      sessionDraftText: sessionStorage.getItem('kairo-record-drafts-v1'),
      editor: document.querySelector('#chat-input')?.value ?? null,
      selected: document.querySelector('#teacher-context-select')?.value || null,
      status: status ? { text: status.textContent, state: status.dataset.state, revision: status.dataset.revision } : null };
  }, state.installation.databaseName);
  const file = join(fixture.out, `${label}.json`); writeFileSync(file, JSON.stringify({ ...state, recovery }, null, 2) + '\n');
  fixture.snapshots.push({ label, file, sha256: sha(readFileSync(file)), revision: state.revision, nativeRowsSha256: digest(state.rows) });
  fixture.phase = label; return { ...state, recovery };
}
function entry(state, contextRef) { return state.record.teacherDrafts?.entries.find((row) => row.contextRef === contextRef) || null; }
function checkDraft(state, contextRef, text, consumed = false, revision) {
  assert.equal(state.record.teacherDrafts?.version, 1, 'Drafts must be part of the durable learner record');
  const found = entry(state, contextRef); assert(found, 'The exact topic has a durable draft record');
  assert.deepEqual(Object.keys(found).sort(), ['consumed', 'contextRef', 'revision', 'text']);
  assert.equal(found.text, text); assert.equal(found.consumed, consumed); assert.match(found.revision, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  if (revision) assert.equal(found.revision, revision); return found;
}
async function durableDraft(fixture, contextRef, text, consumed = false) {
  await waitForAppRecord(fixture.page, (record) => record.teacherDrafts?.entries.some((row) => row.contextRef === contextRef && row.text === text && row.consumed === consumed), { description: 'durable exact teacher draft' });
  return checkDraft(await readAppRecordSnapshot(fixture.page), contextRef, text, consumed);
}
function unchangedExcept(before, after, allowed = []) {
  for (const root of new Set([...Object.keys(before.record), ...Object.keys(after.record)]))
    if (!allowed.includes(root)) assert.deepEqual(after.record[root], before.record[root], `Unrelated learner root changed: ${root}`);
  assert.deepEqual(after.installation, before.installation);
  const syncRows = (state) => state.rows.filter((row) => ['actor', 'operation', 'outbox'].includes(row.kind));
  assert.deepEqual(syncRows(after), syncRows(before), 'Drafts/replies cannot allocate learning sync events or actor sequences');
}
async function restart(fixture, options) {
  await close(fixture); await launch(fixture); await tutor(fixture, options);
}
async function beforeDebounce(fixture, contextRef, text, label) {
  const before = await snapshot(fixture, `${label}-before-typing`);
  const started = Date.now(); await fixture.page.locator('#chat-input').fill(text);
  assert.equal(await fixture.page.locator('#chat-input').inputValue(), text);
  await screenshot(fixture, `${label}-typed-before-browser-close`);
  const typed = await snapshot(fixture, `${label}-typed-native-and-recovery`);
  assert.deepEqual(entry(typed, contextRef), entry(before, contextRef), 'The fast-close fixture must still precede the coalesced native draft commit');
  if (manifest.files.some((file) => file.path === 'teacher-drafts.mjs')) {
    assert(typed.recovery.text, 'A synchronous local recovery slot must exist before native draft durability');
    const recovery = JSON.parse(typed.recovery.text); assert.equal(recovery.installation, typed.recovery.installationText);
    const pending = recovery.entries.find((row) => row.contextRef === contextRef);
    assert(pending); assert.equal(pending.latest.text, text); assert.equal(pending.latest.consumed, false);
  }
  const closingAfterMs = Date.now() - started; await close(fixture); const closedAfterMs = Date.now() - started;
  fixture.observations.push({ name: `${label}-real-browser-close`, debounceMs: 750, closingAfterMs, closedAfterMs, priorNativeDraft: entry(before, contextRef), atCloseNativeDraft: entry(typed, contextRef), recovery: typed.recovery });
  assert(closingAfterMs < 750 && closedAfterMs < 750, 'Fixture must complete its real browser close before the 750 ms commit debounce');
  await launch(fixture); await tutor(fixture); await selectTopic(fixture, contextRef);
  const reopened = await snapshot(fixture, `${label}-reopened-before-assertion`); await screenshot(fixture, `${label}-reopened`);
  assert.equal(await fixture.page.locator('#chat-input').inputValue(), text, 'A clean browser restart must retain the exact unsent teacher draft');
  await durableDraft(fixture, contextRef, text);
  const durable = await snapshot(fixture, `${label}-recovery-durable`); checkDraft(durable, contextRef, text);
  unchangedExcept(before, durable, ['teacherDrafts', 'teacherContexts']); assert.deepEqual(durable.archive, before.archive);
  return { before, typed, reopened, durable };
}

define('clean-close-before-debounce-general', async (fixture) => {
  await tutor(fixture); assert.equal(await fixture.page.locator('#chat-send').isDisabled(), true);
  await beforeDebounce(fixture, null, '  General draft <私> e\u0301 😀\n　kept exactly  ', 'general');
});
define('clean-close-before-debounce-selected-context', async (fixture) => {
  const topic = await createTopic(fixture);
  assert.equal(await fixture.page.locator('#chat-send').isDisabled(), true);
  await beforeDebounce(fixture, topic.id, '  A question about this sentence,\nstill unsent 猫 e\u0301  ', 'selected-context');
});
define('committed-topic-drafts-and-deliberate-clear-survive-browser-restart', async (fixture) => {
  const first = await createTopic(fixture, { index: 0 }); const second = await createTopic(fixture, { index: 2 });
  await selectTopic(fixture, first.id); const aText = '  Topic A independent draft 😀\n  A second line with raw spacing  '; await fixture.page.locator('#chat-input').fill(aText);
  const a = await durableDraft(fixture, first.id, aText);
  await selectTopic(fixture, second.id); await fixture.page.locator('#chat-input').fill('Topic B earlier text');
  const bOld = await durableDraft(fixture, second.id, 'Topic B earlier text'); await fixture.page.locator('#chat-input').fill('');
  const b = await durableDraft(fixture, second.id, ''); assert.notEqual(b.revision, bOld.revision, 'Deliberate empty is a newer authored revision');
  await selectTopic(fixture, null); const generalText = '  General topic remains separate 猫  '; await fixture.page.locator('#chat-input').fill(generalText);
  const general = await durableDraft(fixture, null, generalText);
  const before = await snapshot(fixture, 'all-topics-committed-before-clean-close');
  await restart(fixture);
  for (const [ref, text, revision] of [[null, generalText, general.revision], [first.id, aText, a.revision], [second.id, '', b.revision]]) {
    await selectTopic(fixture, ref); assert.equal(await fixture.page.locator('#chat-input').inputValue(), text);
    checkDraft(await snapshot(fixture, `reopened-topic-${ref === null ? 'general' : ref === first.id ? 'a' : 'b'}`), ref, text, false, revision);
  }
  const after = await snapshot(fixture, 'topic-switches-retain-authored-revisions');
  unchangedExcept(before, after, ['teacherContexts']); assert.deepEqual(after.archive, before.archive);
});

async function exportUi(fixture, label) {
  if (!await fixture.page.locator('#export-store').count()) await fixture.page.locator('#tray').click();
  const downloadWork = fixture.page.waitForEvent('download'); await fixture.page.locator('#export-store').click();
  const download = await downloadWork, file = join(fixture.out, `${label}.json`); await download.saveAs(file);
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(backup.format, 'kairo-backup'); assert.equal(backup.completeness, 'complete');
  assert.equal(backup.sha256.record, digest(backup.record)); assert.equal(backup.sha256.archive, digest(backup.archive));
  if (backup.journal) assert.equal(backup.sha256.journal, digest(backup.journal));
  await fixture.page.waitForFunction(() => document.querySelector('#export-store')?.disabled === false);
  fixture.observations.push({ name: 'normal-ui-backup-download', label, file, sha256: sha(readFileSync(file)), version: backup.version });
  return { backup, file };
}
async function importUi(fixture, file) {
  if (!await fixture.page.locator('#import-file').count()) { await shelf(fixture); await fixture.page.locator('#tray').click(); }
  const timeOrigin = await fixture.page.evaluate(() => performance.timeOrigin);
  await fixture.page.locator('#import-file').setInputFiles(file);
  await fixture.page.waitForFunction((prior) => performance.timeOrigin !== prior && document.body.dataset.ready === '1', timeOrigin, { timeout: 20000 });
  await tutor(fixture);
}
async function pendingQuestion(fixture, contextRef, question, reply, fail = false) {
  await selectTopic(fixture, contextRef); await fixture.page.locator('#chat-input').fill(question);
  const submitted = await durableDraft(fixture, contextRef, question);
  const planned = fixture.transport.plan({ contextRef, question, reply, fail });
  await fixture.page.locator('#chat-send').click();
  const call = await bounded(planned.captured.promise, 'explicit synthetic provider request after outbound durability');
  await fixture.page.waitForFunction(() => document.querySelector('#chat-input')?.readOnly === false);
  assert.equal(await fixture.page.locator('#chat-input').inputValue(), question, 'Outbound save cannot consume a draft while the reply is pending');
  const beforeReply = await snapshot(fixture, `outbound-${fixture.transport.primary.length}`);
  checkDraft(beforeReply, contextRef, question, false, submitted.revision);
  const outbound = beforeReply.archive.turns.filter((row) => row.surface === 'chat' && row.role === 'user' && row.content === question.trim() && (row.contextRef || null) === contextRef).at(-1);
  assert(outbound?.xid, 'An actual durable outbound archive row precedes every synthetic provider call');
  assert(beforeReply.record.aiChat.some((row) => row.role === 'user' && row.text === question.trim() && (row.contextRef || null) === contextRef));
  assert.equal(call.body.messages.at(-1).content, question.trim());
  return { planned, submitted, beforeReply, outbound, call };
}
async function finished(fixture) {
  await fixture.page.waitForFunction(() => document.querySelector('#chat-send')?.disabled === false && !document.querySelector('.chat-turn.thinking'));
}
async function successfulReply(fixture, reply) {
  await waitForAppRecord(fixture.page, (record) => record.aiChat.some((row) => row.role === 'tutor' && row.text === reply), { description: 'durable synthetic tutor reply' });
  await finished(fixture);
}
function replyAndDraft(state, before, submitted, reply, xid, consumed) {
  checkDraft(state, submitted.contextRef, submitted.text, consumed, submitted.revision);
  const archive = state.archive.turns.filter((row) => row.surface === 'chat' && row.xid === xid);
  assert.deepEqual(archive.map((row) => row.role), ['user', 'assistant']); assert.equal(archive[1].content, reply);
  assert(archive.every((row) => (row.contextRef || null) === submitted.contextRef));
  assert.equal(state.record.aiChat.filter((row) => row.role === 'tutor' && row.text === reply).length, 1);
  unchangedExcept(before, state, ['aiChat', 'teacherDrafts']);
}

define('synthetic-delayed-success-preserves-newer-text-and-deliberate-empty', async (fixture) => {
  await tutor(fixture); await configure(fixture);
  for (const [label, nextText] of [['newer', '  Newer same-topic question <猫> e\u0301  '], ['empty', '']]) {
    const question = `  Submitted ${label} question with preserved raw spacing  `, reply = `Synthetic delayed ${label} answer.`;
    const pending = await pendingQuestion(fixture, null, question, reply);
    await fixture.page.locator('#chat-input').fill(nextText); const newer = await durableDraft(fixture, null, nextText);
    assert.notEqual(newer.revision, pending.submitted.revision);
    const edited = await snapshot(fixture, `${label}-edited-while-reply-pending`); await screenshot(fixture, `${label}-visible-while-pending`);
    pending.planned.release(); await successfulReply(fixture, reply);
    assert.equal(await fixture.page.locator('#chat-input').inputValue(), nextText);
    const after = await snapshot(fixture, `${label}-after-delayed-success`); checkDraft(after, null, nextText, false, newer.revision);
    assert.deepEqual(after.record.teacherDrafts, edited.record.teacherDrafts, 'A late response cannot consume a different edit identity');
    assert(after.archive.turns.some((row) => row.role === 'assistant' && row.content === reply && row.xid === pending.outbound.xid));
    unchangedExcept(edited, after, ['aiChat']);
    await restart(fixture); assert.equal(await fixture.page.locator('#chat-input').inputValue(), nextText);
    checkDraft(await snapshot(fixture, `${label}-after-clean-restart`), null, nextText, false, newer.revision);
  }
}, { synthetic: true });

define('synthetic-delayed-error-preserves-newer-text-and-deliberate-empty', async (fixture) => {
  await tutor(fixture); await configure(fixture);
  for (const [label, nextText] of [['newer', '  The learner changed this question during the failed request  '], ['empty', '']]) {
    const pending = await pendingQuestion(fixture, null, `  Failing ${label} request  `, '', true);
    await fixture.page.locator('#chat-input').fill(nextText); const newer = await durableDraft(fixture, null, nextText);
    pending.planned.release();
    await waitForAppRecord(fixture.page, (record) => record.aiChat.some((row) => row.systemMessage === true), { description: 'durable synthetic provider failure line' });
    await finished(fixture);
    assert.equal(await fixture.page.locator('#chat-input').inputValue(), nextText, 'Failure cannot restore old submitted text into a deliberate empty/new draft');
    const after = await snapshot(fixture, `${label}-after-delayed-provider-error`); checkDraft(after, null, nextText, false, newer.revision);
    assert.equal(after.archive.turns.filter((row) => row.xid === pending.outbound.xid && row.role === 'assistant').length, 0);
    unchangedExcept(pending.beforeReply, after, ['aiChat', 'teacherDrafts']);
    await screenshot(fixture, `${label}-failed-request-keeps-current-draft`);
    await restart(fixture); assert.equal(await fixture.page.locator('#chat-input').inputValue(), nextText);
  }
}, { synthetic: true });

define('synthetic-pending-topic-a-reply-cannot-change-topic-b-draft', async (fixture) => {
  const first = await createTopic(fixture, { index: 0 }), second = await createTopic(fixture, { index: 2 });
  await configure(fixture); await selectTopic(fixture, second.id);
  const bText = '  Topic B is a separate pending-context draft  '; await fixture.page.locator('#chat-input').fill(bText);
  const b = await durableDraft(fixture, second.id, bText);
  const reply = 'Synthetic answer belongs to topic A only.';
  const pending = await pendingQuestion(fixture, first.id, '  Topic A submitted question  ', reply);
  await selectTopic(fixture, second.id); assert.equal(await fixture.page.locator('#chat-input').inputValue(), bText);
  await fixture.page.locator('#chat-input').focus();
  pending.planned.release(); await successfulReply(fixture, reply);
  assert.equal(await fixture.page.locator('#teacher-context-select').inputValue(), second.id);
  assert.equal(await fixture.page.locator('#chat-input').inputValue(), bText);
  assert.equal(await fixture.page.locator('#chat-input').evaluate((node) => document.activeElement === node), true);
  const after = await snapshot(fixture, 'topic-b-remains-visible-after-topic-a-reply');
  checkDraft(after, second.id, bText, false, b.revision); checkDraft(after, first.id, pending.submitted.text, true, pending.submitted.revision);
  assert.equal(await fixture.page.locator('.chat-turn.tutor').filter({ hasText: reply }).count(), 0);
  await selectTopic(fixture, first.id); assert.equal(await fixture.page.locator('#chat-input').inputValue(), '');
  assert.equal(await fixture.page.locator('.chat-turn.tutor').filter({ hasText: reply }).count(), 1);
  await restart(fixture); await selectTopic(fixture, second.id); assert.equal(await fixture.page.locator('#chat-input').inputValue(), bText);
}, { synthetic: true });

/** Faults match a unique synthetic reply in the real native learner-record put.
 * They never replace a reducer, storage result, writer predicate, or draft root. */
async function armReplyFault(fixture, mode, reply) {
  assert(['hold', 'quota', 'abort', 'owner-at-complete'].includes(mode));
  const { installation } = await readAppRecordSnapshot(fixture.page);
  await fixture.page.evaluate(({ mode, reply, databaseName }) => {
    if (window.__teacherDraftNativeFault) throw new Error('Teacher draft fault already armed');
    const nativeTransaction = IDBDatabase.prototype.transaction, nativePut = IDBObjectStore.prototype.put;
    const fault = { mode, fired: 0, durable: false, aborted: false, active: true, released: false, putKinds: [], rows: [], readonlyAfterHold: 0 };
    const hold = (tx) => {
      if (fault.released) return;
      const keepalive = tx.objectStore('kairo_replication_rows').get('synthetic-teacher-reply-keepalive'); keepalive.onsuccess = () => hold(tx);
    };
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = nativeTransaction.apply(this, args);
      if (this.name !== databaseName) return tx;
      if (fault.fired && !fault.released && (args[1] || 'readonly') === 'readonly') fault.readonlyAfterHold++;
      if (args[1] === 'readwrite') {
        tx.addEventListener('abort', () => { if (tx.__teacherReply) fault.aborted = true; });
        tx.addEventListener('complete', () => {
          if (!tx.__teacherReply || !fault.active) return;
          fault.durable = true;
          if (mode === 'owner-at-complete') { fault.fired++; fault.active = false; window.dispatchEvent(new Event('pagehide')); }
        });
      }
      return tx;
    };
    IDBObjectStore.prototype.put = function (...args) {
      const request = nativePut.apply(this, args);
      if (this.transaction.db.name !== databaseName || this.name !== 'kairo_replication_rows' || !fault.active) return request;
      const row = args[0], document = row?.kind === 'document' ? JSON.parse(row.text) : null;
      if (document?.collection === 'learner-record' && document.value.aiChat?.some((turn) => turn.role === 'tutor' && turn.text === reply)) this.transaction.__teacherReply = true;
      if (!this.transaction.__teacherReply) return request;
      fault.putKinds.push(row.kind); fault.rows.push(row);
      if (document?.collection === 'kairo:record-host-commands' && mode !== 'owner-at-complete') {
        fault.fired++;
        if (mode === 'hold') hold(this.transaction);
        else if (mode === 'abort') this.transaction.abort();
        else throw new DOMException('Synthetic quota after actual teacher-reply native puts', 'QuotaExceededError');
      }
      return request;
    };
    fault.release = () => { fault.released = true; };
    fault.disarm = () => { fault.active = false; fault.released = true; IDBDatabase.prototype.transaction = nativeTransaction; IDBObjectStore.prototype.put = nativePut; };
    window.__teacherDraftNativeFault = fault;
  }, { mode, reply, databaseName: installation.databaseName });
}
async function fault(fixture, disarm = false) {
  return fixture.page.evaluate((disarm) => {
    const f = window.__teacherDraftNativeFault;
    const result = { mode: f.mode, fired: f.fired, durable: f.durable, aborted: f.aborted, putKinds: f.putKinds, rows: f.rows, readonlyAfterHold: f.readonlyAfterHold };
    if (disarm) { f.disarm(); delete window.__teacherDraftNativeFault; } return result;
  }, disarm);
}

define('synthetic-reply-consumption-and-archive-commit-atomically-old-backup-cannot-resurrect', async (fixture) => {
  await tutor(fixture); await configure(fixture);
  const question = '  Exact raw question retained after successful consumption 猫  ';
  await fixture.page.locator('#chat-input').fill(question); const submitted = await durableDraft(fixture, null, question);
  const old = await exportUi(fixture, 'old-ui-backup-before-reply-consumption'); await tutor(fixture);
  assert.equal(await fixture.page.locator('#chat-input').inputValue(), question);
  const reply = 'Synthetic atomic teacher answer.';
  const planned = fixture.transport.plan({ contextRef: null, question, reply }); await fixture.page.locator('#chat-send').click();
  await bounded(planned.captured.promise, 'synthetic request after existing draft submit');
  await fixture.page.waitForFunction(() => document.querySelector('#chat-input')?.readOnly === false);
  const before = await snapshot(fixture, 'reply-transaction-before'); checkDraft(before, null, question, false, submitted.revision);
  const xid = before.archive.turns.find((row) => row.surface === 'chat' && row.role === 'user' && row.content === question.trim()).xid;
  await armReplyFault(fixture, 'hold', reply); planned.release();
  await fixture.page.waitForFunction(() => window.__teacherDraftNativeFault?.fired === 1);
  assert.equal((await fault(fixture)).durable, false); assert.equal(await fixture.page.locator('#chat-input').inputValue(), question);
  let checkpointSettled = false;
  const checkpoint = snapshot(fixture, 'exact-native-checkpoint-after-held-reply').then((value) => { checkpointSettled = true; return value; });
  void checkpoint.catch(() => undefined);
  await fixture.page.waitForFunction(() => window.__teacherDraftNativeFault?.readonlyAfterHold > 0);
  assert.equal(checkpointSettled, false, 'The native checkpoint must wait behind the held real reply transaction');
  await fixture.page.evaluate(() => window.__teacherDraftNativeFault.release());
  const committed = await checkpoint, proof = await fault(fixture, true);
  assert.equal(proof.durable, true); assert.equal(proof.aborted, false); assert.equal(committed.revision, before.revision + 1);
  replyAndDraft(committed, before, submitted, reply, xid, true);
  const command = committed.documents.filter((row) => row.collection === 'kairo:record-host-commands' && !before.documents.some((old) => old.collection === row.collection && old.id === row.id));
  assert.equal(command.length, 1); assert.equal(command[0].value.recordSha256, digest(committed.record)); assert.equal(command[0].value.archiveSha256, digest(committed.archive));
  assert.equal(command[0].value.beforeRevision, before.revision); assert.equal(command[0].value.committedRevision, committed.revision);
  await successfulReply(fixture, reply); assert.equal(await fixture.page.locator('#chat-input').inputValue(), '');
  fixture.observations.push({ name: 'genuine-native-reply-atomicity', checkpointBlocked: true, proof });
  await importUi(fixture, old.file);
  const restored = await snapshot(fixture, 'old-backup-cannot-resurrect-consumed-draft'); checkDraft(restored, null, question, true, submitted.revision);
  assert.equal(await fixture.page.locator('#chat-input').inputValue(), '');
  await restart(fixture); checkDraft(await snapshot(fixture, 'consumed-raw-text-retained-after-browser-restart'), null, question, true, submitted.revision);
  assert.equal(await fixture.page.locator('#chat-input').inputValue(), '');
}, { synthetic: true, fault: true });

for (const mode of ['quota', 'abort']) define(`synthetic-native-${mode}-reply-keeps-unconsumed-draft-and-archive-atomic`, async (fixture) => {
  await tutor(fixture); await configure(fixture);
  const reply = `Synthetic ${mode} reply that must never become durable.`;
  const pending = await pendingQuestion(fixture, null, `  Keep my ${mode} draft on storage failure  `, reply);
  await armReplyFault(fixture, mode, reply); pending.planned.release();
  await fixture.page.waitForFunction(() => window.__teacherDraftNativeFault?.aborted === true);
  const proof = await fault(fixture, true); assert.equal(proof.fired, 1); assert.equal(proof.durable, false);
  assert(proof.rows.some((row) => row.kind === 'document' && JSON.parse(row.text).collection === 'learner-archive'));
  const failed = await snapshot(fixture, `${mode}-native-abort-observed`); assert.deepEqual(failed.rows, pending.beforeReply.rows, 'Reply, consumed marker and archive must roll back together');
  checkDraft(failed, null, pending.submitted.text, false, pending.submitted.revision);
  assert.equal(await fixture.page.locator('#chat-input').inputValue(), pending.submitted.text);
  fixture.observations.push({ name: 'explicit-native-reply-fault', proof });
  await restart(fixture); assert.equal(await fixture.page.locator('#chat-input').inputValue(), pending.submitted.text);
  checkDraft(await snapshot(fixture, `${mode}-draft-reopened`), null, pending.submitted.text, false, pending.submitted.revision);
}, { synthetic: true, fault: true });

define('synthetic-owner-revoked-at-durable-reply-cannot-publish-or-resurrect', async (fixture) => {
  await tutor(fixture); await configure(fixture);
  const reply = 'Synthetic durable reply whose old owner loses publication authority.';
  const pending = await pendingQuestion(fixture, null, '  Exact draft survives as consumed raw text after owner loss  ', reply);
  await armReplyFault(fixture, 'owner-at-complete', reply); pending.planned.release();
  await fixture.page.waitForFunction(() => window.__teacherDraftNativeFault?.durable === true);
  const proof = await fault(fixture, true); assert.equal(proof.fired, 1);
  const committed = await snapshot(fixture, 'owner-invalidated-after-durable-reply');
  replyAndDraft(committed, pending.beforeReply, pending.submitted, reply, pending.outbound.xid, true);
  assert.equal(await fixture.page.locator('#chat-input').inputValue(), pending.submitted.text, 'An invalidated owner cannot clear its visible draft on unacknowledged completion');
  assert.equal(await fixture.page.locator('.chat-turn.tutor').filter({ hasText: reply }).count(), 0);
  await restart(fixture);
  const reopened = await snapshot(fixture, 'new-owner-confirms-consumed-durable-reply'); checkDraft(reopened, null, pending.submitted.text, true, pending.submitted.revision);
  assert.equal(await fixture.page.locator('#chat-input').inputValue(), '');
  assert.equal(reopened.archive.turns.filter((row) => row.role === 'assistant' && row.content === reply).length, 1);
  fixture.observations.push({ name: 'synthetic-pagehide-at-real-native-completion', proof });
}, { synthetic: true, fault: true });

define('non-original-source-refusal-keeps-draft-and-never-sends', async (fixture) => {
  const catalog = JSON.parse(readFileSync(join(retainedSite, 'data/articles/index.json'), 'utf8'));
  const publication = catalog.articles.find((row) => row.title === '野ばら'); assert(publication && publication.pool !== 'original');
  const topic = await createTopic(fixture, { articleId: publication.id, index: 1 }); await configure(fixture); await selectTopic(fixture, topic.id);
  const question = '  This saved source reference is not permission to send its quote  ';
  await fixture.page.locator('#chat-input').fill(question); const draft = await durableDraft(fixture, topic.id, question);
  const before = await snapshot(fixture, 'source-refusal-before-send'); await fixture.page.locator('#chat-send').click();
  await fixture.page.waitForFunction(() => document.querySelector('#chat-status')?.textContent.includes('not available for tutor processing'));
  await finished(fixture); assert.equal(await fixture.page.locator('#chat-input').inputValue(), question);
  const after = await snapshot(fixture, 'source-refusal-after-send'); checkDraft(after, topic.id, question, false, draft.revision);
  assert.deepEqual(after.archive, before.archive); assert.deepEqual(after.record.aiChat, before.record.aiChat);
  unchangedExcept(before, after); assert.equal(fixture.transport.primary.length, 0); assert.equal(fixture.transport.mining.length, 0);
  await restart(fixture); await selectTopic(fixture, topic.id); assert.equal(await fixture.page.locator('#chat-input').inputValue(), question);
}, { synthetic: true });

async function auxiliary(fixture, label) {
  const out = join(fixture.out, label); mkdirSync(out, { recursive: true });
  const child = { out, profile: join(out, 'profile'), engine: fixture.engine, synthetic: false, context: null, page: null,
    phase: 'auxiliary-boot', opens: 0, observations: [], screenshots: [], snapshots: [], errors: [] };
  child.transport = transportFor(child); await launch(child); return child;
}
async function finishAuxiliary(fixture, child, label) {
  child.transport.releaseAll(); await close(child);
  assert.deepEqual(child.errors, []); assert.deepEqual(child.transport.blocked, []);
  fixture.observations.push({ name: label, profile: child.profile, observations: child.observations, screenshots: child.screenshots,
    snapshots: child.snapshots, errors: child.errors, externalRequestsSent: 0 });
}
define('portable-backup-preserves-current-topic-text-empty-and-new-imported-topic', async (fixture) => {
  const first = await createTopic(fixture, { index: 0 }), second = await createTopic(fixture, { index: 2 });
  const wanted = [];
  for (const [ref, text] of [[first.id, '  Current A must survive an older portable backup  '], [second.id, ''], [null, '  Current general stays separate  ']]) {
    await selectTopic(fixture, ref);
    if (text === '') { await fixture.page.locator('#chat-input').fill('Earlier B draft deliberately removed'); await durableDraft(fixture, ref, 'Earlier B draft deliberately removed'); }
    await fixture.page.locator('#chat-input').fill(text); wanted.push(await durableDraft(fixture, ref, text));
  }
  const before = await snapshot(fixture, 'target-current-drafts-before-import');
  const donor = await auxiliary(fixture, 'normal-ui-donor'); let importedTopic, donorDraft, original;
  try {
    const donorA = await createTopic(donor, { index: 0 }), donorB = await createTopic(donor, { index: 2 });
    assert.equal(donorA.id, first.id); assert.equal(donorB.id, second.id);
    for (const [ref, text] of [[first.id, 'Older A from portable backup'], [second.id, 'Older B must not resurrect a deliberate clear'], [null, 'Older general from portable backup']]) {
      await selectTopic(donor, ref); await donor.page.locator('#chat-input').fill(text); await durableDraft(donor, ref, text);
    }
    const article = JSON.parse(readFileSync(join(retainedSite, 'data/articles/bunki-graded-n3-river.json'), 'utf8'));
    const index = article.tokens.findIndex((token, index) => index > 10 && token.c);
    importedTopic = await createTopic(donor, { index });
    const text = '  A previously absent imported topic keeps its own raw draft  '; await donor.page.locator('#chat-input').fill(text);
    donorDraft = await durableDraft(donor, importedTopic.id, text); original = await exportUi(donor, 'normal-ui-donor-full-backup');
    await snapshot(donor, 'donor-native-record-and-drafts');
  } finally { await finishAuxiliary(fixture, donor, 'independent-normal-ui-donor-profile'); }
  // With no replicated operations, normal UI export already emits a portable
  // v1 backup. Import the actual unchanged file from the independent profile;
  // there is no foreign account journal to strip or synthetic envelope to add.
  assert.equal(original.backup.version, 1);
  assert.equal(original.backup.journal, undefined);
  const file = original.file;
  fixture.observations.push({ name: 'normal-ui-portable-donor-backup', source: file, file,
    sha256: sha(readFileSync(file)), recordBytesUnchanged: true, archiveBytesUnchanged: true,
    entireExportUnchanged: true, accountSyncClaim: false });
  await importUi(fixture, file); const after = await snapshot(fixture, 'current-and-imported-topic-drafts-after-real-import');
  assert.deepEqual(after.installation, before.installation);
  for (const draft of [...wanted, donorDraft]) {
    checkDraft(after, draft.contextRef, draft.text, draft.consumed, draft.revision);
    await selectTopic(fixture, draft.contextRef); assert.equal(await fixture.page.locator('#chat-input').inputValue(), draft.consumed ? '' : draft.text);
  }
  await restart(fixture); await selectTopic(fixture, importedTopic.id);
  assert.equal(await fixture.page.locator('#chat-input').inputValue(), donorDraft.text);
  const exported = await exportUi(fixture, 'merged-drafts-real-ui-export');
  for (const draft of [...wanted, donorDraft]) assert.deepEqual(exported.backup.record.teacherDrafts.entries.find((row) => row.contextRef === draft.contextRef), draft);
});

define('synthetic-backup-missing-context-draft-preserved-as-unavailable', async (fixture) => {
  const topic = await createTopic(fixture);
  const text = '  Unavailable source question stays byte exact\n猫 e\u0301 😀  ';
  await fixture.page.locator('#chat-input').fill(text); const draft = await durableDraft(fixture, topic.id, text);
  const original = await exportUi(fixture, 'normal-ui-original-context-and-draft-backup');
  const backup = structuredClone(original.backup);
  backup.record.teacherContexts.entries = backup.record.teacherContexts.entries.filter((entry) => entry.id !== topic.id);
  if (backup.record.teacherContexts.activeRef === topic.id) backup.record.teacherContexts.activeRef = null;
  backup.sha256.record = digest(backup.record);
  const file = join(fixture.out, 'explicit-synthetic-backup-with-missing-source-context.json');
  writeFileSync(file, JSON.stringify(backup, null, 2) + '\n');
  fixture.observations.push({ name: 'explicit-synthetic-portable-backup-missing-context', source: original.file, file,
    sha256: sha(readFileSync(file)), removedContextRef: topic.id, preservedDraft: draft, nativeInputWrites: 0 });
  await importUi(fixture, file);
  const after = await snapshot(fixture, 'missing-context-import-preserves-raw-draft');
  checkDraft(after, topic.id, text, false, draft.revision);
  assert.equal(after.record.teacherContexts.entries.some((entry) => entry.id === topic.id), false);
  assert.equal(await fixture.page.locator(`#teacher-context-select option[value="${topic.id}"]`).count(), 0);
  const unavailable = fixture.page.locator(`#teacher-unavailable-drafts [data-teacher-draft-topic="${topic.id}"]`);
  assert.equal(await unavailable.locator('.teacher-draft-quote').textContent(), text);
  assert.equal(await unavailable.locator('button').count(), 1, 'The unavailable topic offers only manual copy');
  assert.match(await unavailable.locator('button').textContent(), /copy|コピー/iu);
  assert.equal(await unavailable.locator('#chat-send,[data-teacher-send]').count(), 0);
  assert.equal(await fixture.page.locator('#chat-input').inputValue(), '', 'Unavailable draft text must not become a general-conversation send');
  await screenshot(fixture, 'unavailable-source-question-retained-visibly');
  await restart(fixture);
  assert.equal(await fixture.page.locator(`#teacher-unavailable-drafts [data-teacher-draft-topic="${topic.id}"] .teacher-draft-quote`).textContent(), text);
  const reopened = await snapshot(fixture, 'unavailable-source-question-after-browser-restart');
  checkDraft(reopened, topic.id, text, false, draft.revision);
  assert.deepEqual(reopened.archive, after.archive); unchangedExcept(after, reopened);
  const reexported = await exportUi(fixture, 'unavailable-draft-remains-in-normal-ui-backup');
  assert.deepEqual(reexported.backup.record.teacherDrafts.entries.find((entry) => entry.contextRef === topic.id), draft);
}, { fault: true });

async function injectRecovery(fixture, text, label) {
  // Leave the actual app first, so its lifecycle cannot accidentally erase the
  // explicitly injected storage fault. This fixture never writes IndexedDB.
  await fixture.page.goto(`${ORIGIN}/synthetic-local-recovery-fault`);
  const before = await snapshot(fixture, `${label}-native-before-slot-fault`);
  await fixture.page.evaluate(({ key, text }) => localStorage.setItem(key, text), { key: before.recovery.key, text });
  const file = join(fixture.out, `${label}-exact-injected-local-slot.txt`); writeFileSync(file, text);
  fixture.observations.push({ name: 'explicit-synthetic-localStorage-recovery-fault', label, file, sha256: sha(readFileSync(file)), nativeInputWrites: 0 });
  await tutor(fixture, { protectedState: true }); return before;
}
define('synthetic-recovery-conflict-foreign-and-malformed-slots-stay-visible-and-retained', async (fixture) => {
  await tutor(fixture); await fixture.page.locator('#chat-input').fill('Original durable base');
  await durableDraft(fixture, null, 'Original durable base');
  const candidateText = '  Pending raw recovery text from an older edit  '; await fixture.page.locator('#chat-input').fill(candidateText);
  const pending = await snapshot(fixture, 'actual-synchronous-local-recovery-slot');
  assert(pending.recovery.text, 'Typing must create the synchronous recovery slot before the coalesced commit');
  const staleText = pending.recovery.text, stale = JSON.parse(staleText);
  assert.equal(stale.installation, pending.recovery.installationText); assert.equal(stale.entries.find((row) => row.contextRef === null).latest.text, candidateText);
  await durableDraft(fixture, null, candidateText);
  const currentText = '  A later native draft with an incompatible edit revision  '; await fixture.page.locator('#chat-input').fill(currentText);
  const current = await durableDraft(fixture, null, currentText);
  const before = await injectRecovery(fixture, staleText, 'stale-conflict');
  await fixture.page.waitForFunction(() => document.querySelector('#teacher-draft-status')?.dataset.state === 'conflict');
  assert.equal(await fixture.page.locator('#chat-input').getAttribute('readonly'), '');
  const conflict = await snapshot(fixture, 'stale-slot-preserved-as-visible-conflict');
  assert.equal(conflict.recovery.text, staleText); checkDraft(conflict, null, currentText, false, current.revision);
  assert.deepEqual(conflict.rows, before.rows);
  assert.equal(await fixture.page.locator('[data-teacher-recovery-use=""]').count(), 1);
  await screenshot(fixture, 'visible-recovery-choice-before-explicit-keep');
  await fixture.page.locator('[data-teacher-recovery-keep=""]').click();
  await fixture.page.waitForFunction(() => document.querySelector('#teacher-draft-status')?.dataset.state === 'saved');
  assert.equal(await fixture.page.locator('#chat-input').inputValue(), currentText);
  checkDraft(await snapshot(fixture, 'explicit-keep-retains-current-draft'), null, currentText, false, current.revision);
  await injectRecovery(fixture, staleText, 'stale-explicit-use');
  await fixture.page.waitForFunction(() => document.querySelector('#teacher-draft-status')?.dataset.state === 'conflict');
  await fixture.page.locator('[data-teacher-recovery-use=""]').click();
  await durableDraft(fixture, null, candidateText); assert.equal(await fixture.page.locator('#chat-input').inputValue(), candidateText);
  const resolved = await snapshot(fixture, 'explicit-use-acknowledged-recovery-draft');
  assert.deepEqual(resolved.archive, before.archive); unchangedExcept(before, resolved, ['teacherDrafts']);
  const donor = await auxiliary(fixture, 'foreign-installation'); let foreign;
  try {
    await tutor(donor); await donor.page.locator('#chat-input').fill('Foreign installation unsent text');
    foreign = (await snapshot(donor, 'foreign-synchronous-recovery-slot')).recovery.text;
    assert(foreign); assert.notEqual(JSON.parse(foreign).installation, resolved.recovery.installationText);
  } finally { await finishAuxiliary(fixture, donor, 'separate-foreign-installation-output'); }
  for (const [label, text] of [['foreign', foreign], ['malformed', '{"version":1,"entries":[ preserve these malformed recovery bytes']]) {
    const beforeFault = await injectRecovery(fixture, text, label);
    await fixture.page.waitForFunction(() => document.querySelector('#teacher-draft-status')?.dataset.state === 'unavailable');
    const kept = await snapshot(fixture, `${label}-slot-retained-and-visible`);
    assert.equal(kept.recovery.text, text); assert.deepEqual(kept.record.teacherDrafts, beforeFault.record.teacherDrafts);
    assert.deepEqual(kept.archive, beforeFault.archive);
    assert.match(kept.recovery.status.text, /draft|recover|下書|復旧/iu);
    await screenshot(fixture, `${label}-recovery-state`);
    await restart(fixture, { protectedState: true });
    const reopened = await snapshot(fixture, `${label}-slot-retained-after-browser-close`); assert.equal(reopened.recovery.text, text);
    assert.deepEqual(reopened.record.teacherDrafts, beforeFault.record.teacherDrafts);
  }
}, { fault: true });

async function run(definition, engine) {
  const out = join(OUT, engine, definition.name); mkdirSync(out, { recursive: true });
  const fixture = { out, profile: join(out, 'profile'), engine, synthetic: !!definition.synthetic, context: null, page: null,
    phase: 'boot', opens: 0, observations: [], screenshots: [], snapshots: [], errors: [] };
  assert(!existsSync(fixture.profile), 'Every new case begins with a fresh owned browser profile');
  fixture.transport = transportFor(fixture);
  const started = Date.now(); let failure;
  try {
    await launch(fixture); await definition.body(fixture);
    assert.deepEqual(fixture.errors, []); assert.deepEqual(fixture.transport.blocked, []);
    assert.equal(fixture.transport.plans.length, 0, 'Every planned provider response requires an actual matching learner send');
  } catch (error) {
    failure = String(error.stack || error);
    const failurePhase = fixture.phase;
    if (fixture.context) {
      await screenshot(fixture, 'failure').catch(() => undefined);
      const activeFault = await fixture.page.evaluate(() => {
        const fault = window.__teacherDraftNativeFault;
        if (!fault) return null;
        const result = { mode: fault.mode, fired: fault.fired, durable: fault.durable, aborted: fault.aborted };
        fault.disarm(); return result;
      }).catch(() => null);
      if (activeFault) fixture.observations.push({ name: 'native-fault-released-after-case-failure', ...activeFault });
      await bounded(snapshot(fixture, 'failure-native-record'), 'failure native checkpoint').catch(() => undefined);
    }
    fixture.phase = failurePhase;
  } finally {
    fixture.transport.releaseAll();
    if (fixture.context) await fixture.page.evaluate(() => window.__teacherDraftNativeFault?.disarm()).catch(() => undefined);
    await close(fixture);
  }
  if (!failure && (fixture.errors.length || fixture.transport.blocked.length)) failure = 'Unexpected application error or external request during case teardown';
  const result = { name: definition.name, engine, pass: !failure, error: failure, elapsedMs: Date.now() - started,
    phase: fixture.phase, syntheticProvider: fixture.synthetic, faultCase: !!definition.fault,
    profile: fixture.profile, browserLaunches: fixture.opens, observations: fixture.observations, screenshots: fixture.screenshots,
    snapshots: fixture.snapshots, errors: fixture.errors,
    transport: { primary: fixture.transport.primary, mining: fixture.transport.mining, blocked: fixture.transport.blocked, preflights: fixture.transport.preflights, externalRequestsSent: 0 } };
  const file = join(out, 'receipt.json'); writeFileSync(file, JSON.stringify(result, null, 2) + '\n'); results.push({ ...result, file });
  console.log(`${engine} ${definition.name}: ${result.pass ? 'PASS' : `FAIL (${fixture.phase})`}`);
}
try {
  for (const filter of FILTERS) assert(definitions.some((definition) => definition.name === filter), `Unknown case: ${filter}`);
  for (const engine of ENGINES) for (const definition of definitions)
    if (!FILTERS.size || FILTERS.has(definition.name)) await run(definition, engine);
} finally {
  server.closeAllConnections(); await new Promise((done) => server.close(done));
  writeFileSync(join(OUT, 'receipt.json'), JSON.stringify({ suite: 'teacher-drafts', version: 1,
    pass: results.length === ENGINES.length * (FILTERS.size || definitions.length) && results.every((row) => row.pass),
    mode: FILTERS.size ? 'filtered' : 'full', engines: ENGINES, browserVersions, startedAt, completedAt: new Date().toISOString(),
    artifactSha256: manifest.artifactSha256, sourceAssetSha256: manifest.sourceAssetSha256, selectedSite: SITE, testedSite: retainedSite,
    verifierSha256, sourceCopies, results,
    limitations: ['Normal UI with owned persistent browser profiles; closing and relaunching a browser is distinct from page reload.',
      'Native IndexedDB rows are output evidence only; no seeded native record or copied reducer provides success state.',
      'Configured provider responses and named storage/recovery faults are explicit synthetic fixtures. Every other external request is aborted; no live teaching or physical-device acceptance is claimed.',
      'Only assertions before a recorded failure phase executed in a failing case.'] }, null, 2) + '\n');
}
assert.equal(results.length, ENGINES.length * (FILTERS.size || definitions.length));
assert(results.every((row) => row.pass), 'Teacher-draft persistent-browser journeys failed');
