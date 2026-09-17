/** Rendered-app integrity over real origin Web Locks and native IndexedDB.
 * All records/credentials are synthetic and external transport is intercepted.
 * Crash boundaries instrument browser APIs only; no app source override, public
 * fixture seeding, or localStorage projection substitutes for the active record.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { verifyBundledArtifact } from '../../bunki-desktop/lib/artifact.cjs';
import { armRecordWriteFailure, clearRecordWriteFailure, readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';

const OUT = resolveCorridorEvidence();
const ROOT = resolveCorridorSite();
assert.equal(process.env.KAIRO_RECORD_SOURCE, undefined, 'Integrity must test the selected immutable runtime without source overrides');
const artifact = verifyBundledArtifact(ROOT);
const sourceHash = createHash('sha256').update(readFileSync(resolve(ROOT, 'corridor.js'))).digest('hex');
const verifierSha256 = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const FILTERS = new Set(process.argv.filter((arg) => arg.startsWith('--case=')).map((arg) => arg.slice(7)));
const seed = { v: 1, taken: [{ t: 'word', id: '学校' }], srs: {}, revlog: [], obslog: [] };
const originalTurn = { surface: 'chat', role: 'user', content: 'Synthetic original conversation.', ts: 1700000000001, xid: 'original' };
const incomingTurn = { surface: 'writing', role: 'assistant', content: 'Synthetic incoming learner feedback.', ts: 1700000000002, xid: 'incoming' };
const incoming = { ...seed, taken: [{ t: 'word', id: '犬' }], aiEvidence: { incoming: [incomingTurn] } };
const provider = JSON.stringify({ v: 1, baseUrl: 'https://integrity-provider.invalid', model: 'synthetic', credential: { origin: 'https://integrity-provider.invalid', key: 'SYNTHETIC-NEVER-REAL' } });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2' };
const results = [];
const external = [];
const observations = {};
const startedAt = new Date().toISOString();
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const sha = (value) => createHash('sha256').update(canonical(value)).digest('hex');
function backup(record, turns) {
  const archive = { version: 1, turns };
  return { format: 'kairo-backup', version: 1, completeness: record.aiEvidenceIncomplete ? 'incomplete' : 'complete', record, archive,
    counts: { archiveTurns: turns.length, chatTurns: record.aiChat?.length || 0, readingVersions: (record.aiReadings?.length || 0) + (record.aiReading ? 1 : 0) },
    sha256: { record: sha(record), archive: sha(archive) } };
}
const server = createServer((request, response) => {
  let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (path === '/blank') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>Synthetic record harness</title>'); return; }
  if (path.startsWith('/second/')) path = path.slice('/second'.length);
  const file = resolve(ROOT, path === '/' ? 'index.html' : path.slice(1));
  if (!file.startsWith(`${ROOT}/`) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  response.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, ignoreDefaultArgs: ['--disable-back-forward-cache'] });
const engineVersion = browser.version();

async function boot(page, prefix = '') {
  await page.goto(`${base}/${prefix}index.html?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
}
async function legacyArchive(page, { version = 3, turns = [], journals = [], malformed = false, hold = false } = {}) {
  await page.evaluate(async ({ version, turns, journals, malformed, hold }) => {
    const db = await new Promise((done, fail) => {
      const req = indexedDB.open('kairo-ai-log', version);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore('turns', { keyPath: 'id', autoIncrement: true });
        if (version >= 3) { store.createIndex('logical-id', 'turn.id', { unique: false }); req.result.createObjectStore('imports', { keyPath: 'id' }); }
      };
      req.onsuccess = () => done(req.result); req.onerror = () => fail(req.error);
    });
    try {
      await new Promise((done, fail) => {
        const tx = db.transaction(version >= 3 ? ['turns', 'imports'] : ['turns'], 'readwrite');
        turns.forEach((turn, index) => tx.objectStore('turns').put(version < 3 ? { ...turn, id: index + 1 } : { format: 'kairo-archive-row', v: malformed ? 99 : 1, id: index + 1, turn }));
        for (const journal of journals) tx.objectStore('imports').put(journal);
        tx.oncomplete = done; tx.onabort = () => fail(tx.error);
      });
    } finally { if (hold) window.__integrityHeldLegacyDb = db; else db.close(); }
  }, { version, turns, journals, malformed, hold });
}
async function fresh({ record = seed, extra = {}, turns = [], beforeBoot, init, deferBoot = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, serviceWorkers: 'block' });
  const errors = [];
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  try {
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === base) return route.continue();
      external.push({ origin: url.origin, path: url.pathname });
      if (url.origin === 'https://integrity-provider.invalid' && url.pathname.endsWith('/v1/messages')) {
        const request = route.request().postDataJSON();
        const text = String(request.system).includes('observations about the LEARNER') ? '[]' : `Synthetic reply to ${request.messages.at(-1).content}`;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text }] }) });
      }
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto(`${base}/blank`);
    await page.evaluate(({ recordText, extra }) => {
      localStorage.setItem('kairo-corridor-v1', recordText);
      for (const [key, value] of Object.entries(extra)) localStorage.setItem(key, value);
    }, { recordText: JSON.stringify(record), extra });
    if (beforeBoot) await beforeBoot(page); else await legacyArchive(page, { turns });
    if (init) await context.addInitScript(init);
    if (!deferBoot) await boot(page);
    return { context, page, errors };
  } catch (error) { await context.close(); throw error; }
}
async function tray(page) { if (!(await page.locator('#note-input').count())) await page.click('#tray'); }
async function state(page) {
  const local = await page.evaluate(() => ({ legacyRaw: localStorage.getItem('kairo-corridor-v1'), driftRaw: localStorage.getItem('bunki-drift-v1'), installed: localStorage.getItem('kairo-local-record-binding-v1'), alert: document.querySelector('#store-alert')?.textContent || '' }));
  let target = null;
  if (local.installed) try { target = await readAppRecordSnapshot(page); } catch (error) { local.targetReadError = error.message; }
  return { ...local, target, record: target?.record || null, archive: target?.archive?.turns || [] };
}
async function legacyDisk(page) {
  return page.evaluate(async () => {
    const db = await new Promise((done, fail) => { const req = indexedDB.open('kairo-ai-log'); req.onsuccess = () => done(req.result); req.onerror = () => fail(req.error); req.onupgradeneeded = () => { req.transaction.abort(); fail(new Error('Legacy source must already exist')); }; });
    try {
      const names = [...db.objectStoreNames];
      return await new Promise((done, fail) => {
        const tx = db.transaction(names, 'readonly');
        const turns = tx.objectStore('turns').getAll();
        const journals = names.includes('imports') ? tx.objectStore('imports').getAll() : null;
        tx.oncomplete = () => done({ version: db.version, physicalTurns: turns.result, journals: journals?.result || [] });
        tx.onabort = () => fail(tx.error);
      });
    } finally { db.close(); }
  });
}
async function submitNote(page, text, { refused = false } = {}) {
  await tray(page); await page.fill('#note-input', text);
  if (refused) {
    assert.equal(await page.locator('#note-send').isDisabled(), true, 'A non-owner/protected note action must be disabled');
    await page.locator('#note-send').evaluate((node) => node.click());
    assert.equal(await page.inputValue('#note-input'), text);
    return;
  }
  await page.click('#note-send');
  await waitForAppRecord(page, (record) => record.obslog?.some((row) => row[3] === text), { description: 'accepted note on native disk' });
  await page.locator('.note-row').filter({ hasText: text }).waitFor();
}
async function ask(page, text) {
  const before = await readAppRecordSnapshot(page);
  if (!(await page.locator('#chat-input').count())) await page.click('#ai-link');
  await page.fill('#chat-input', text); await page.click('#chat-send');
  await waitForAppRecord(page, (record) => record.aiChat?.some((turn) => turn.role === 'tutor' && turn.text === `Synthetic reply to ${text}`), { description: 'real chat reply commit' });
  await page.waitForFunction(() => document.querySelector('#chat-send')?.disabled === false);
  // The app archives its asynchronous mining exchange too. Wait for that
  // accepted evidence before checking/exporting the complete conversation.
  const deadline = Date.now() + 10000;
  let appended;
  do {
    appended = (await readAppRecordSnapshot(page)).archive.turns.slice(before.archive.turns.length);
    if (appended.length >= 4) break;
    await delay(25);
  } while (Date.now() < deadline);
  assert.deepEqual(appended.map((row) => row.content), [text, `Synthetic reply to ${text}`, `Learner wrote:\n${text}\n\nTutor replied:\nSynthetic reply to ${text}`, '[]']);
  assert.deepEqual(appended.map((row) => row.surface), ['chat', 'chat', 'mine', 'mine']);
  assert.deepEqual(appended.map((row) => row.role), ['user', 'assistant', 'user', 'assistant']);
  assert.equal(appended[2].contextRef, appended[0].xid); assert.equal(appended[3].contextRef, appended[0].xid);
}
async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function exported(page) {
  await tray(page);
  const pending = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#export-store');
  const value = await readDownload(await pending);
  await waitForAppRecord(page, (record) => !!record.stats?.lastExportTs, { description: 'export timestamp acknowledgment' });
  return value;
}
async function imported(page, value, reload = true) {
  await tray(page);
  const marker = randomUUID();
  await page.evaluate((marker) => { window.__integrityDocument = marker; }, marker);
  await page.locator('#import-file').setInputFiles({ name: 'synthetic-record.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  if (reload) {
    await page.waitForFunction((marker) => window.__integrityDocument !== marker, marker, { timeout: 20000 });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  }
}
async function rejectedImport(page, value) {
  await tray(page);
  await page.locator('.port-row:has(#import-file) + .airead-note').evaluate((node) => { node.textContent = ''; });
  await imported(page, value, false);
  await page.waitForFunction(() => !!document.querySelector('.port-row:has(#import-file) + .airead-note')?.textContent, null, { timeout: 10000 });
}
function sameLearner(before, after) {
  assert.deepEqual(after.record, before.record, 'native learner record remains exact');
  assert.deepEqual(after.archive, before.archive, 'native archive remains exact');
  assert.equal(after.legacyRaw, before.legacyRaw, 'legacy record source/fence remains exact');
  assert.equal(after.driftRaw, before.driftRaw, 'legacy Drift source/fence remains exact');
}

function installNativePause({ phase, match }) {
  const nativePut = IDBObjectStore.prototype.put;
  const nativeTransaction = IDBDatabase.prototype.transaction;
  const matched = new WeakSet();
  let armed = true;
  const fault = window.__integrityNativePause = { phase, match, fired: false, nativeCompleted: false };
  const pause = (completed) => { armed = false; fault.fired = true; fault.nativeCompleted = completed; debugger; };
  IDBDatabase.prototype.transaction = function (...args) {
    const target = this.name.startsWith('kairo-local-record:');
    if (armed && target && match === 'snapshot' && (!args[1] || args[1] === 'readonly')) pause(false);
    const tx = nativeTransaction.apply(this, args);
    if (target && args[1] === 'readwrite') tx.addEventListener('complete', () => { if (armed && phase === 'after' && matched.has(tx)) pause(true); });
    return tx;
  };
  IDBObjectStore.prototype.put = function (...args) {
    if (armed && this.transaction.db.name.startsWith('kairo-local-record:') && args[0]?.kind === 'document') {
      const row = JSON.parse(args[0].text);
      const matches = match === 'activation'
        ? row.collection === 'kairo:migration' && row.value.phase === 'active'
        : row.collection === 'kairo:record-host-commands' && row.value.type === (match === 'restore' ? 'host.restore/1' : 'app.patch/1');
      if (matches) { matched.add(this.transaction); if (phase === 'before') pause(false); }
    }
    return nativePut.apply(this, args);
  };
}
async function nativePause(context, page, config, beforeBoot = false) {
  const session = await context.newCDPSession(page);
  await session.send('Debugger.enable');
  const paused = new Promise((done) => session.once('Debugger.paused', done));
  if (beforeBoot) await page.addInitScript(installNativePause, config); else await page.evaluate(installNativePause, config);
  return { session, page, paused };
}
async function reached(point) {
  let timer;
  try {
    const stopped = await Promise.race([point.paused, new Promise((_, fail) => { timer = setTimeout(() => fail(new Error('Native transaction interruption boundary was not reached')), 15000); })]);
    const result = await point.session.send('Debugger.evaluateOnCallFrame', { callFrameId: stopped.callFrames[0].callFrameId, expression: 'JSON.stringify(window.__integrityNativePause)', returnByValue: true });
    assert.equal(result.exceptionDetails, undefined);
    const observed = JSON.parse(result.result.value);
    assert.equal(observed.fired, true);
    return observed;
  } finally { clearTimeout(timer); }
}
async function closePaused(point) {
  // Graceful close can resume a paused function and commit it. Crash first,
  // observe that event, then close the target to preserve the exact boundary.
  const { targetInfo } = await point.session.send('Target.getTargetInfo');
  let timer;
  const crashed = new Promise((done) => point.page.once('crash', done));
  point.session.send('Page.crash').catch(() => {});
  try { await Promise.race([crashed, new Promise((_, fail) => { timer = setTimeout(() => fail(new Error('Synthetic renderer did not crash at the native boundary')), 12000); })]); }
  finally { clearTimeout(timer); }
  const session = await browser.newBrowserCDPSession();
  assert.equal((await session.send('Target.closeTarget', { targetId: targetInfo.targetId })).success, true);
  await session.detach();
}
async function test(name, body, options = {}) {
  if (FILTERS.size && !FILTERS.has(name)) return;
  const started = Date.now();
  const dir = resolve(OUT, name); mkdirSync(dir, { recursive: true });
  let fixture, timer;
  try {
    fixture = await fresh(options);
    await Promise.race([body(fixture), new Promise((_, fail) => { timer = setTimeout(() => fail(new Error('Integrity journey exceeded 90 seconds')), 90000); })]);
    assert.deepEqual(fixture.errors, [], 'no unexpected JavaScript page errors');
    results.push({ name, pass: true, elapsedMs: Date.now() - started }); console.log(`ok ${name}`);
  } catch (error) {
    results.push({ name, pass: false, message: error.message, pageErrors: fixture?.errors || [], elapsedMs: Date.now() - started });
    writeFileSync(resolve(dir, 'failure.txt'), error.stack || error.message);
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    clearTimeout(timer);
    if (fixture) await fixture.context.close();
    writeFileSync(resolve(dir, 'receipt.json'), JSON.stringify(results.at(-1), null, 2) + '\n');
  }
}

try {
  await test('single-writer-preserves-both-tabs-note-intents', async ({ context, page: a }) => {
    const b = await context.newPage(); await boot(b, 'second/');
    await tray(a); await tray(b);
    await a.fill('#note-input', 'Synthetic note from A.'); await b.fill('#note-input', 'Synthetic note from B.');
    const point = await nativePause(context, a, { phase: 'before', match: 'patch' });
    const submitting = a.click('#note-send'); submitting.catch(() => {});
    assert.equal((await reached(point)).nativeCompleted, false);
    await submitNote(b, 'Synthetic note from B.', { refused: true });
    assert.deepEqual(await b.evaluate(() => window.__KAIRO_AI__.logAll()), []);
    await point.session.send('Debugger.resume'); await submitting;
    await waitForAppRecord(a, (record) => record.obslog.length === 1);
    await a.close(); await boot(b, 'second/'); await tray(b);
    assert.equal(await b.inputValue('#note-input'), 'Synthetic note from B.', 'handoff preserves the unacknowledged draft');
    await submitNote(b, 'Synthetic note from B.');
    assert.deepEqual((await state(b)).record.obslog.map((row) => row[3]), ['Synthetic note from A.', 'Synthetic note from B.']);
  });
  await test('interrupted-import-restores-old-record-and-entire-archive', async ({ context, page }) => {
    const before = await state(page); await tray(page);
    const point = await nativePause(context, page, { phase: 'before', match: 'restore' });
    const selecting = imported(page, incoming, false); selecting.catch(() => {});
    assert.equal((await reached(point)).nativeCompleted, false);
    await closePaused(point); await selecting.catch(() => {});
    const reopened = await context.newPage(); await boot(reopened);
    sameLearner(before, await state(reopened));
    assert.deepEqual((await legacyDisk(reopened)).journals, []);
  }, { turns: [originalTurn] });
  await test('full-backup-restores-unreferenced-and-contextual-conversations', async ({ page }) => {
    const before = await state(page); const value = await exported(page); await imported(page, value);
    const after = await state(page);
    assert.deepEqual(after.archive, before.archive); assert.deepEqual(after.record, value.record);
  }, { turns: Array.from({ length: 32 }, (_, i) => ({ surface: i % 2 ? 'word-tutor' : 'chat', role: i % 3 ? 'assistant' : 'tutor', content: `Synthetic retained turn ${i}.`, model: 'fixture', ts: 1700000001000 + i, xid: i % 2 ? `exchange-${i}` : 'unreferenced', contextRef: `word:学校-${i}`, future: { keep: i } })) });
  await test('durable-chat-and-readings-survive-save-export-and-reselection', async ({ page }) => {
    await submitNote(page, 'Synthetic save without truncation.'); await boot(page);
    await page.click('#airead-link'); await page.click('[data-airead-past="13"]');
    const selected = await waitForAppRecord(page, (record) => record.aiReading?.text === 'Synthetic original reading 13.');
    assert.equal(selected.aiReadings.length, 14);
    const value = await exported(page); assert.equal(value.record.aiChat.length, 40); assert.equal(value.record.aiReadings.length, 14);
    await imported(page, value); const restored = await state(page);
    assert.equal(restored.record.aiChat.length, 40); assert.equal(restored.record.aiReadings.length, 14);
  }, { record: { ...seed, aiChat: Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'tutor' : 'user', text: `Synthetic chat ${i}.` })), aiReading: { text: 'Synthetic current reading.', lv: 'N5', ts: 1700000000000 }, aiReadings: Array.from({ length: 14 }, (_, i) => ({ text: `Synthetic original reading ${i}.`, lv: 'N5', ts: 1700000001000 + i, provenance: { version: `reading-${i}` } })) }, extra: { 'kairo-ai-provider-v1': provider } });
  await test('committed-import-finalizes-after-interruption-with-identical-portable-record', async ({ context, page }) => {
    const before = await state(page); await tray(page);
    const point = await nativePause(context, page, { phase: 'after', match: 'restore' });
    const selecting = imported(page, backup(before.record, [incomingTurn]), false); selecting.catch(() => {});
    assert.equal((await reached(point)).nativeCompleted, true, 'native complete precedes app acknowledgment');
    await closePaused(point); await selecting.catch(() => {});
    const reopened = await context.newPage(); await boot(reopened); const after = await state(reopened);
    assert.deepEqual(after.record, before.record); assert.deepEqual(after.archive, [incomingTurn]);
    assert.equal(after.target.revision, before.target.revision + 1); assert.equal(after.legacyRaw, before.legacyRaw);
    assert.deepEqual((await legacyDisk(reopened)).journals, []);
  }, { turns: [originalTurn] });
  await test('unknown-record-during-import-quarantines-all-competing-bytes', async ({ context, page }) => {
    const before = await state(page); await tray(page);
    const point = await nativePause(context, page, { phase: 'after', match: 'restore' });
    const selecting = imported(page, incoming, false); selecting.catch(() => {});
    assert.equal((await reached(point)).nativeCompleted, true);
    const foreign = await context.newPage(); await foreign.goto(`${base}/blank`);
    const unknown = JSON.stringify({ ...seed, future: 'uncoordinated legacy writer' });
    await foreign.evaluate((raw) => localStorage.setItem('kairo-corridor-v1', raw), unknown);
    await closePaused(point); await selecting.catch(() => {}); await boot(foreign);
    const actual = await state(foreign);
    assert.equal(actual.legacyRaw, unknown); assert.deepEqual(actual.record.taken, incoming.taken);
    assert.equal(actual.archive[0].content, incomingTurn.content); assert.match(actual.alert, /protected|recovery|preserved|paused/i);
    const migration = actual.target.documents.find((row) => row.collection === 'kairo:migration');
    assert.equal(migration.value.phase, 'quarantined');
    const custody = actual.target.documents.find((row) => row.collection === 'kairo:migration-custody');
    assert.equal(custody.value.source.recordText, JSON.stringify(seed));
    assert.deepEqual(custody.value.source.archive.rows, (await legacyDisk(foreign)).physicalTurns);
    assert.equal((await foreign.evaluate(() => window.__KAIRO_AI__.exportRecord())).text, null);
    assert.deepEqual(await foreign.evaluate(() => window.__KAIRO_AI__.logAll()), []);
    await submitNote(foreign, 'Uncommitted quarantine draft.', { refused: true });
    const after = await state(foreign); assert.equal(after.legacyRaw, unknown); assert.deepEqual(after.target.rows, actual.target.rows);
    assert.deepEqual(before.archive.map((row) => row.content), [originalTurn.content]);
  }, { turns: [originalTurn] });
  for (const mode of ['quota', 'abort']) {
    await test(`${mode}-target-import-keeps-original-record-archive-and-custody`, async ({ page }) => {
      const before = await state(page); const legacy = await legacyDisk(page);
      await armRecordWriteFailure(page, mode); await rejectedImport(page, incoming);
      assert.ok((await clearRecordWriteFailure(page)).fired > 0, 'native host restore fault must actually fire');
      const after = await state(page); sameLearner(before, after); assert.deepEqual(after.target.rows, before.target.rows);
      assert.deepEqual(await legacyDisk(page), legacy); await boot(page); sameLearner(before, await state(page));
    }, { turns: [originalTurn] });
  }
  await test('full-export-cannot-pair-owner-record-with-sibling-import', async ({ context, page: a }) => {
    const b = await context.newPage(); await boot(b, 'second/'); await tray(a); await tray(b);
    const point = await nativePause(context, a, { phase: 'before', match: 'snapshot' });
    const downloading = a.waitForEvent('download'); const exporting = a.click('#export-store'); exporting.catch(() => {});
    await reached(point); await rejectedImport(b, incoming);
    assert.equal((await b.evaluate(() => window.__KAIRO_AI__.exportRecord())).text, null);
    await point.session.send('Debugger.resume'); await exporting;
    const value = await readDownload(await downloading);
    assert.deepEqual(value.record.taken, seed.taken); assert.deepEqual(value.archive.turns.map((row) => row.content), [originalTurn.content]);
  }, { turns: [originalTurn] });
  for (const unavailable of ['unsupported', 'rejected']) {
    await test(`web-lock-${unavailable}-fails-closed`, async ({ page }) => {
      const before = await state(page); assert.equal(before.target, null); assert.equal(before.installed, null);
      await submitNote(page, 'A draft without safe ownership.', { refused: true });
      assert.equal((await state(page)).legacyRaw, JSON.stringify(seed));
      assert.deepEqual(await page.evaluate(() => window.__KAIRO_AI__.logAll()), []);
      assert.equal((await page.evaluate(() => window.__KAIRO_AI__.exportRecord())).text, null);
      await rejectedImport(page, incoming); assert.equal((await state(page)).legacyRaw, before.legacyRaw);
      assert.ok((await state(page)).alert.length > 0);
    }, { init: unavailable === 'unsupported'
      ? () => Object.defineProperty(navigator, 'locks', { value: undefined })
      : () => Object.defineProperty(navigator, 'locks', { value: { request: () => Promise.reject(new Error('Synthetic lock rejection')) } }) });
  }
  await test('blocked-idb-upgrade-fails-closed-and-does-not-leak-late-handle', async ({ context, page }) => {
    assert.match((await state(page)).alert, /protected|recovery|paused/i);
    const before = await state(page); assert.equal(before.record, null);
    await submitNote(page, 'Waiting for old DB connection.', { refused: true });
    assert.equal((await state(page)).legacyRaw, before.legacyRaw);
    await context.__integrityOldDatabasePage.close();
    // A timed-out upgrade must abort its later upgradeneeded callback. A leaked
    // connection would block this clean owner from upgrading the same source.
    await boot(page); await tray(page);
    assert.equal(await page.inputValue('#note-input'), 'Waiting for old DB connection.');
    await submitNote(page, 'Waiting for old DB connection.');
    assert.equal((await state(page)).record.obslog.length, 1); assert.equal((await legacyDisk(page)).version, 3);
  }, { beforeBoot: async (page) => {
    const old = await page.context().newPage(); page.context().__integrityOldDatabasePage = old;
    await old.goto(`${base}/blank`); await legacyArchive(old, { version: 1, hold: true });
  } });
  await test('versionchange-revokes-record-access-without-clobbering', async ({ context, page }) => {
    const before = await state(page);
    const upgrader = await context.newPage(); await upgrader.goto(`${base}/blank`);
    await upgrader.evaluate((databaseName) => new Promise((done, fail) => {
      const req = indexedDB.open(databaseName, 2); req.onsuccess = () => { req.result.close(); done(); }; req.onerror = () => fail(req.error);
    }), before.target.installation.databaseName);
    await tray(page); await page.fill('#note-input', 'Version change draft.'); await page.click('#note-send');
    await page.waitForFunction(() => !!document.querySelector('#store-alert')?.textContent);
    assert.equal(await page.inputValue('#note-input'), 'Version change draft.');
    sameLearner(before, await state(page));
    assert.deepEqual(await page.evaluate(() => window.__KAIRO_AI__.logAll()), []);
    await boot(page); await tray(page); assert.equal(await page.inputValue('#note-input'), 'Version change draft.');
    assert.ok((await state(page)).alert.length > 0); sameLearner(before, await state(page));
    assert.equal((await page.evaluate(() => window.__KAIRO_AI__.exportRecord())).text, null);
  }, { turns: [originalTurn] });
  for (const malformed of [false, true]) {
    await test(`${malformed ? 'malformed' : 'future'}-legacy-archive-refuses-activation-without-changing-sources`, async ({ page }) => {
      const before = await state(page); const disk = await legacyDisk(page);
      assert.equal(before.record, null); assert.equal(before.legacyRaw, JSON.stringify(seed)); assert.ok(before.alert.length > 0);
      assert.equal(disk.version, malformed ? 3 : 4);
      assert.deepEqual(disk.physicalTurns, [{ format: 'kairo-archive-row', v: malformed ? 99 : 1, id: 1, turn: originalTurn }]);
      assert.deepEqual(await page.evaluate(() => window.__KAIRO_AI__.logAll()), []);
      assert.equal((await page.evaluate(() => window.__KAIRO_AI__.exportRecord())).text, null);
      await submitNote(page, 'Refused archive activation draft.', { refused: true });
      await boot(page); assert.deepEqual(await legacyDisk(page), disk); assert.equal((await state(page)).legacyRaw, before.legacyRaw);
    }, { beforeBoot: (page) => legacyArchive(page, { version: malformed ? 3 : 4, malformed, turns: [originalTurn] }) });
  }
  await test('new-backup-rejects-inconsistent-digests-counts-and-legacy-evidence', async ({ page }) => {
    const value = await exported(page);
    for (const mutate of [
      (copy) => { copy.counts.archiveTurns += 1; },
      (copy) => { copy.futureArchive = { unsupported: true }; },
      (copy) => { copy.archive.futureMetadata = { unsupported: true }; },
      (copy) => { copy.archive.turns[0].content = 'Different content with stale digest.'; },
      (copy) => { copy.record.aiEvidence = { ['__proto__']: [{ ...originalTurn, xid: '__proto__', contextRef: 'word:学校', content: 'Conflicting legacy evidence.' }] }; },
    ]) {
      const copy = structuredClone(value); mutate(copy);
      // Recompute the digest in the conflict case so semantic agreement must
      // reject it independently of byte integrity.
      if (copy.record.aiEvidence) copy.sha256.record = sha(copy.record);
      const before = await state(page); await rejectedImport(page, copy); sameLearner(before, await state(page));
      assert.deepEqual((await legacyDisk(page)).journals, []);
    }
  }, { turns: [{ ...originalTurn, xid: '__proto__', contextRef: 'word:学校' }] });
  await test('foreground-observation-survives-pagehide-and-owner-reload-exactly-once', async ({ page }) => {
    const before = await waitForAppRecord(page, (record) => record.obslog.some((row) => row[1] === 'params'), { description: 'foreground invalid-parameter observation' });
    assert.equal(before.obslog.length, 1, 'one acknowledged observation despite repeated render requests');
    assert.deepEqual(before.obslog[0].slice(1), ['params', 'fsrs', 'length']);
    await page.goto(`${base}/blank`); assert.deepEqual((await readAppRecordSnapshot(page)).record, before);
    await boot(page); const after = await state(page);
    assert.equal(after.record.obslog.length, 1); assert.deepEqual(after.record.srs, {});
  }, { record: { ...seed, srsPrefs: { fsrs: { w: [1], source: 'synthetic-invalid-parameters' } } } });
  await test('history-navigation-never-reuses-writer-ownership-and-preserves-draft', async ({ context, page: a }) => {
    await tray(a); await a.fill('#note-input', 'History navigation draft.');
    await a.evaluate(() => { window.__sameDocumentMarker = true; window.__restoredFromBfcache = false; addEventListener('pageshow', (event) => { window.__restoredFromBfcache = event.persisted; }); });
    await a.goto(`${base}/blank`);
    const b = await context.newPage(); await boot(b); await submitNote(b, 'Owner changed during history navigation.');
    await a.evaluate(() => history.back());
    await a.waitForFunction(() => location.pathname.endsWith('/index.html') && document.body.dataset.ready === '1'); await tray(a);
    observations.historyUsedBfcache = await a.evaluate(() => window.__sameDocumentMarker === true && window.__restoredFromBfcache === true);
    assert.equal(await a.inputValue('#note-input'), 'History navigation draft.');
    await submitNote(a, 'History navigation draft.', { refused: true });
    assert.equal((await state(a)).record.obslog.length, 1); assert.deepEqual(await a.evaluate(() => window.__KAIRO_AI__.logAll()), []);
    await b.close(); await a.evaluate(() => { window.__beforeOwnerReload = true; });
    await a.click('#record-reload'); await a.waitForFunction(() => !window.__beforeOwnerReload && document.body.dataset.ready === '1');
    await submitNote(a, 'History navigation draft.');
    assert.deepEqual((await state(a)).record.obslog.map((row) => row[3]), ['Owner changed during history navigation.', 'History navigation draft.']);
  });
  await test('refused-high-id-import-preserves-subsequent-archive-appends', async ({ page }) => {
    const before = await state(page); const legacy = await legacyDisk(page);
    await armRecordWriteFailure(page, 'quota');
    await rejectedImport(page, { ...seed, aiEvidence: { extreme: [{ surface: 'chat', role: 'user', content: 'Synthetic extreme archive key.', ts: 1700000000010, id: Number.MAX_SAFE_INTEGER }] } });
    assert.ok((await clearRecordWriteFailure(page)).fired > 0); sameLearner(before, await state(page));
    assert.deepEqual(await legacyDisk(page), legacy); await boot(page);
    await ask(page, 'Synthetic subsequent archive turn one.'); await ask(page, 'Synthetic subsequent archive turn two.');
    const complete = await state(page); assert.equal(complete.archive.length, before.archive.length + 8);
    const value = await exported(page); await imported(page, value); assert.deepEqual((await state(page)).archive, complete.archive);
  }, { turns: [originalTurn], extra: { 'kairo-ai-provider-v1': provider } });
  await test('legacy-archive-migration-preserves-opaque-metadata-and-order', async ({ page }) => {
    const before = await state(page);
    assert.deepEqual(before.archive.map((row) => row.content), ['Synthetic old question.', 'Synthetic old reply.']);
    assert.equal(before.archive[0].turn.id, 'same-opaque-metadata'); assert.equal(before.archive[1].turn.id, 'same-opaque-metadata');
    assert.deepEqual(before.archive.map((row) => row.id), [1, 2]);
    const value = await exported(page); await imported(page, value); assert.deepEqual((await state(page)).archive, before.archive);
  }, { beforeBoot: (page) => legacyArchive(page, { version: 1, turns: [
    { surface: 'chat', role: 'user', content: 'Synthetic old question.', ts: 1700000000050, turn: { id: 'same-opaque-metadata' } },
    { surface: 'chat', role: 'tutor', content: 'Synthetic old reply.', ts: 1700000000040, turn: { id: 'same-opaque-metadata' } },
  ] }) });
  await test('saturated-logical-ids-and-backwards-clocks-preserve-conversation-order', async ({ page }) => {
    const initial = (await state(page)).archive;
    assert.deepEqual(initial.map((row) => row.id), [Number.MAX_SAFE_INTEGER, '__proto__', 'constructor']);
    await page.evaluate(() => { Date.now = () => 1700000000100; });
    const expected = initial.map((row) => row.content);
    for (let i = 0; i < 6; i++) {
      const text = `Synthetic queued turn ${i}.`;
      expected.push(text, `Synthetic reply to ${text}`, `Learner wrote:\n${text}\n\nTutor replied:\nSynthetic reply to ${text}`, '[]');
      await ask(page, text);
    }
    const complete = (await state(page)).archive;
    assert.deepEqual(complete.map((row) => row.content), expected); assert.equal(new Set(complete.map((row) => row.id)).size, complete.length);
    assert.ok(complete.slice(3).every((row) => row.ts <= initial[0].ts), 'append order survives a backwards wall clock');
    const value = await exported(page); await imported(page, value); assert.deepEqual((await state(page)).archive, complete);
    const before = await state(page);
    await rejectedImport(page, backup(before.record, [...complete, { ...originalTurn, id: Number.MAX_SAFE_INTEGER, content: 'Duplicate logical ID must not replace the question.' }]));
    sameLearner(before, await state(page));
  }, { extra: { 'kairo-ai-provider-v1': provider }, turns: [
    { id: Number.MAX_SAFE_INTEGER, surface: 'chat', role: 'user', content: 'Synthetic question before clock rollback.', ts: 1700000000300, contextRef: 'word:学校' },
    { id: '__proto__', surface: 'chat', role: 'assistant', content: 'Synthetic reply after clock rollback.', ts: 1700000000200, contextRef: 'word:学校' },
    { id: 'constructor', surface: 'chat', role: 'app', content: 'Synthetic same-clock annotation.', ts: 1700000000200 },
  ] });
  await test('interrupted-migration-activation-recovers-exact-custody-after-fencing', async ({ context, page }) => {
    const point = await nativePause(context, page, { phase: 'before', match: 'activation' }, true);
    const loading = boot(page); loading.catch(() => {});
    assert.equal((await reached(point)).nativeCompleted, false);
    await closePaused(point); await loading.catch(() => {});
    const reopened = await context.newPage(); await reopened.goto(`${base}/blank`);
    const interrupted = await state(reopened);
    assert.equal(JSON.parse(interrupted.legacyRaw).v, 2);
    assert.equal(interrupted.target.documents.find((row) => row.collection === 'kairo:migration').value.phase, 'intent');
    const binding = interrupted.installed;
    await boot(reopened); const resumed = await state(reopened);
    assert.equal(resumed.target.documents.find((row) => row.collection === 'kairo:migration').value.phase, 'active');
    const custody = resumed.target.documents.filter((row) => row.collection === 'kairo:migration-custody');
    assert.equal(custody.length, 1); assert.equal(custody[0].value.source.recordText, JSON.stringify(seed));
    assert.deepEqual(resumed.record.taken, seed.taken); assert.deepEqual(resumed.archive.map((row) => row.content), [originalTurn.content]);
    await boot(reopened); assert.equal((await state(reopened)).installed, binding);
  }, { deferBoot: true, turns: [originalTurn] });
  for (const phase of ['before', 'after', 'unknown']) {
    const token = 'synthetic-old-import-generation';
    const afterRecord = { ...seed, taken: [{ t: 'word', id: '犬' }], recordGeneration: token };
    const legacyRecord = phase === 'before' ? seed : phase === 'after' ? afterRecord : { ...seed, future: 'competing old import bytes' };
    const wrap = (turn) => ({ format: 'kairo-archive-row', v: 1, id: 1, turn });
    const journal = { v: 1, id: 'active', token, beforeText: JSON.stringify(seed), afterText: JSON.stringify(afterRecord), beforeRows: [wrap(originalTurn)], afterRows: [wrap(incomingTurn)] };
    await test(`legacy-import-journal-${phase}-generation-recovers-before-target-activation`, async ({ page }) => {
      const actual = await state(page); const disk = await legacyDisk(page);
      if (phase === 'unknown') {
        assert.equal(actual.record, null); assert.equal(actual.installed, null);
        assert.equal(actual.legacyRaw, JSON.stringify(legacyRecord));
        assert.deepEqual(disk.physicalTurns, journal.afterRows); assert.deepEqual(disk.journals, [journal]);
        assert.ok(actual.alert.length > 0); assert.deepEqual(await page.evaluate(() => window.__KAIRO_AI__.logAll()), []);
        assert.equal((await page.evaluate(() => window.__KAIRO_AI__.exportRecord())).text, null);
        await submitNote(page, 'Legacy journal recovery draft.', { refused: true });
        await boot(page); assert.deepEqual(await legacyDisk(page), disk); assert.equal((await state(page)).legacyRaw, actual.legacyRaw);
        await tray(page); assert.equal(await page.inputValue('#note-input'), 'Legacy journal recovery draft.');
        return;
      }
      const expectedTurn = phase === 'before' ? originalTurn : incomingTurn;
      assert.deepEqual(actual.record.taken, legacyRecord.taken); assert.deepEqual(actual.archive, [expectedTurn]);
      assert.deepEqual(disk.journals, []); assert.deepEqual(disk.physicalTurns, [wrap(expectedTurn)]);
      const custody = actual.target.documents.find((row) => row.collection === 'kairo:migration-custody');
      assert.equal(custody.value.source.recordText, JSON.stringify(legacyRecord));
      assert.deepEqual(custody.value.source.archive.rows, [wrap(expectedTurn)]);
      const exportedRecord = await exported(page); assert.equal(Object.hasOwn(exportedRecord.record, 'recordGeneration'), false);
      assert.deepEqual(exportedRecord.archive.turns, [expectedTurn]);
      await boot(page); assert.deepEqual((await state(page)).archive, [expectedTurn]); assert.deepEqual((await legacyDisk(page)).journals, []);
    }, { record: legacyRecord, beforeBoot: (page) => legacyArchive(page, { turns: [incomingTurn], journals: [journal] }) });
  }
} finally {
  await browser.close(); await new Promise((done) => server.close(done));
}
if (!results.length) results.push({ name: [...FILTERS].join(',') || 'matrix', pass: false, message: 'No case matched.' });
assert.equal(verifyBundledArtifact(ROOT).artifactSha256, artifact.artifactSha256, 'immutable artifact stayed identical throughout the run');
const failures = results.filter((row) => !row.pass).length;
writeFileSync(resolve(OUT, 'receipt.json'), JSON.stringify({ suite: 'record-integrity', site: ROOT, artifactSha256: artifact.artifactSha256, sourceHash, verifierSha256, startedAt, finishedAt: new Date().toISOString(), engineVersion, onlySyntheticData: true, externalRequestsSent: 0, intercepted: external, observations, results, failures,
  limitation: 'CDP renderer-crash cases run in Chromium. Record-live separately covers rendered native-commit and uncertain-publication journeys in Chromium and WebKit. Pagehide assertions cover acknowledged foreground writes, not unacknowledged async work.' }, null, 2) + '\n');
console.log(`Record integrity: ${results.length - failures}/${results.length} passed.`);
process.exitCode = failures ? 1 : 0;
