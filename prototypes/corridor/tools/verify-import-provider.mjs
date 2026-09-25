/** Actual-browser import and provider regressions. All records and credentials
 * are synthetic, and every external request is intercepted before transport.
 * KAIRO_SITE_DIR may name the staged release; evidence stays outside the repo.
 * --boundary-only runs the two original P0 reproductions before/after a patch.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecordSnapshot, waitForAppRecord, armRecordWriteFailure, clearRecordWriteFailure } from './record-test-support.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolveCorridorSite();
const OUTPUT = resolve(process.env.KAIRO_EVIDENCE_DIR || resolve(homedir(), '.dharma/bunki_audit/import-provider'));
const DEVICE_KEY = 'kairo-ai-provider-v1';
const LEGACY_KEY = 'kairo-ai-key';
const DEFAULT_ORIGIN = 'https://api.anthropic.com';
const DEFAULT_CREDENTIAL = 'synthetic-default-provider-key-never-real';
const CUSTOM_CREDENTIAL = 'synthetic-custom-provider-key-never-real';
const SECOND_CREDENTIAL = 'synthetic-second-provider-key-never-real';
const CASE_FILTER = process.argv.find((arg) => arg.startsWith('--case='))?.slice('--case='.length);
const seed = { v: 1, taken: [{ t: 'word', id: '学校' }] };
const parameterPin = JSON.parse(readFileSync(resolve(TOOL_DIR, '../data/fsrs-pin.json'), 'utf8'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2' };
mkdirSync(OUTPUT, { recursive: true });
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/__import_test_blank') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>Synthetic import test</title>');
    return;
  }
  const file = resolve(ROOT, path === '/' ? 'index.html' : path.replace(/^\/+/, ''));
  if (!file.startsWith(`${ROOT}/`) || !existsSync(file)) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const results = [];
const transport = [];
let caseNumber = 0;

async function fresh(record = seed, extraStorage = {}) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, serviceWorkers: 'block' });
  const calls = [];
  const pageErrors = [];
  const behavior = { redirect: false };
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === base) return route.continue();
    const key = request.headers()['x-api-key'];
    const call = {
      origin: url.origin,
      pathname: url.pathname,
      credential: key === DEFAULT_CREDENTIAL ? 'default-synthetic' : key === CUSTOM_CREDENTIAL ? 'custom-synthetic' : key === SECOND_CREDENTIAL ? 'second-synthetic' : key ? 'unexpected' : 'none',
    };
    calls.push(call);
    transport.push(call);
    if (url.pathname.endsWith('/v1/messages')) {
      if (behavior.redirect && url.origin === DEFAULT_ORIGIN) {
        return route.fulfill({ status: 307, headers: { location: 'https://redirect-recipient.invalid/v1/messages', 'access-control-allow-origin': '*' } });
      }
      let body = {};
      try { body = request.postDataJSON(); } catch { /* the assertion owns invalid bodies */ }
      const reply = String(body.system || '').includes('observations about the LEARNER') ? '[]' : 'Synthetic reply for a transport regression.';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: reply }] }) });
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${base}/__import_test_blank`);
  await page.evaluate(({ record, entries }) => {
    localStorage.setItem('kairo-corridor-v1', JSON.stringify(record));
    for (const [key, value] of Object.entries(entries)) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  }, { record, entries: {
    [LEGACY_KEY]: DEFAULT_CREDENTIAL,
    [DEVICE_KEY]: JSON.stringify({ v: 1, baseUrl: DEFAULT_ORIGIN, model: 'synthetic-default-model', credential: { origin: DEFAULT_ORIGIN, key: DEFAULT_CREDENTIAL } }),
    ...extraStorage,
  } });
  await page.goto(`${base}/index.html?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  return { context, page, calls, pageErrors, behavior };
}

async function importRecord(page, record) {
  if (!(await page.locator('#import-file').count())) await page.click('#tray');
  const marker = `document-${++caseNumber}`;
  await page.evaluate((value) => { window.__importDocument = value; }, marker);
  await page.locator('#import-file').setInputFiles({
    name: `synthetic-record-${caseNumber}.json`, mimeType: 'application/json',
    buffer: Buffer.isBuffer(record) ? record : Buffer.from(JSON.stringify(record)),
  });
  await page.waitForFunction((value) => window.__importDocument !== value || !!document.querySelector('.port-row:has(#import-file)')?.nextElementSibling?.textContent, marker, { timeout: 15000 });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
}

async function state(page) {
  const snapshot = await readAppRecordSnapshot(page);
  const fences = await page.evaluate(() => ({
    legacyRaw: localStorage.getItem('kairo-corridor-v1'),
    crossing: localStorage.getItem('kairo-crossing-v1'),
  }));
  return { ...fences, raw: JSON.stringify(snapshot.record), archive: snapshot.archive.turns, revision: snapshot.revision };
}

async function seedArchive(page) {
  assert.equal(await page.evaluate(() => window.__KAIRO_AI__.__seed({ surface: 'chat', role: 'user', content: 'Synthetic conversation retained before import.', model: 'fixture', ts: 1700000000000 })), true);
}

async function ask(page, text = 'Synthetic learner message.') {
  if (!(await page.locator('#chat-input').count())) await page.click('#ai-link');
  await page.fill('#chat-input', text);
  await page.click('#chat-send');
  await page.waitForFunction(() => document.querySelector('#chat-send') && !document.querySelector('#chat-send').disabled, null, { timeout: 15000 });
}

/** A disconnected tutor still keeps a useful question draft. Deliberately
 * bypassing the disabled button must not bypass credential binding. */
async function disconnectedDraft(page, calls, text) {
  const callCount = calls.length;
  assert.equal(await page.locator('#chat-input').count(), 1);
  assert.equal(await page.locator('#chat-send').isDisabled(), true);
  await page.fill('#chat-input', text);
  await waitForAppRecord(page, (record) => record.teacherDrafts?.entries.some((draft) => draft.contextRef === null && draft.text === text && !draft.consumed));
  const before = await readAppRecordSnapshot(page);
  await page.locator('#chat-send').evaluate((button) => { button.disabled = false; });
  await page.click('#chat-send');
  await page.waitForFunction(() => document.querySelector('#chat-send')?.disabled && !document.querySelector('.chat-turn.thinking'));
  const after = await readAppRecordSnapshot(page);
  assert.equal(calls.length, callCount, 'An unbound credential cannot send even through a tampered button');
  assert.deepEqual(after.archive, before.archive);
  assert.deepEqual(after.record.aiChat, before.record.aiChat);
  assert.equal(await page.inputValue('#chat-input'), text);
}

async function exportRecord(page) {
  if (!(await page.locator('#export-store').count())) await page.click('#tray');
  const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
  await page.click('#export-store');
  const stream = await (await downloadPromise).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function test(name, body, record = seed, extraStorage = {}) {
  if (CASE_FILTER && name !== CASE_FILTER) return;
  const fixture = await fresh(record, extraStorage);
  try {
    await body(fixture);
    assert.deepEqual(fixture.pageErrors, [], 'no uncaught application error');
    results.push({ name, pass: true });
    console.log(`  ok  ${name}`);
  } catch (error) {
    const failure = { name, pass: false, message: error.message, pageErrors: fixture.pageErrors };
    results.push(failure);
    console.error(` FAIL ${name}: ${error.message}`);
    await fixture.page.screenshot({ path: resolve(OUTPUT, `${name}.png`) }).catch(() => {});
  } finally {
    await fixture.context.close();
  }
}

try {
  await test('invalid-root-preserves-record-and-archive', async ({ page }) => {
    await seedArchive(page);
    const before = await state(page);
    await importRecord(page, { v: 1, taken: [], srs: 'invalid' });
    assert.deepEqual(await state(page), before);
    assert.match(await page.locator('.port-row:has(#import-file)').evaluate((node) => node.nextElementSibling.textContent), /Import could not finish/);
  });
  await test('import-cannot-redirect-existing-credential', async ({ page, calls }) => {
    await importRecord(page, { ...seed, ai: { baseUrl: 'https://import-recipient.invalid', model: 'imported-model' } });
    await ask(page);
    assert.ok(calls.length > 0, 'the retained default provider still answers');
    assert.ok(calls.every((call) => call.origin === DEFAULT_ORIGIN && call.credential === 'default-synthetic'), JSON.stringify(calls));
    assert.equal(Object.hasOwn(JSON.parse((await state(page)).raw), 'ai'), false, 'portable transport root is discarded');
  });

  if (!process.argv.includes('--boundary-only')) {
    for (const kind of ['custom', 'default']) {
      const origin = kind === 'custom' ? 'https://pre-upgrade-custom.invalid' : DEFAULT_ORIGIN;
      const key = kind === 'custom' ? CUSTOM_CREDENTIAL : DEFAULT_CREDENTIAL;
      await test(`legacy-${kind}-credential-requires-binding`, async ({ page, calls }) => {
        await page.click('#ai-link');
        await disconnectedDraft(page, calls, 'Synthetic post-upgrade question kept without transport.');
        assert.deepEqual(calls, [], 'an unbound legacy key cannot be assigned to any provider');
        assert.equal(await page.inputValue('#ai-key-input'), '');
        assert.match(await page.locator('#ai-config-note').textContent(), /Reconnect/);
        assert.equal(await page.evaluate((name) => localStorage.getItem(name), LEGACY_KEY), key, 'upgrade preserves the old key locally');
        assert.equal(await page.evaluate((name) => localStorage.getItem(name), DEVICE_KEY), null);
        await page.fill('#ai-base-url', origin);
        await page.fill('#ai-model-input', 'synthetic-reconnected-model');
        await page.fill('#ai-key-input', key);
        await page.click('#ai-key-save');
        await ask(page, 'Synthetic request after explicit reconnection.');
        assert.ok(calls.length > 0);
        assert.ok(calls.every((call) => call.origin === origin && call.credential === `${kind}-synthetic`));
        assert.equal(await page.evaluate((name) => localStorage.getItem(name), LEGACY_KEY), null);
      }, { ...seed, ai: { baseUrl: origin, model: 'synthetic-legacy-model' } }, { [DEVICE_KEY]: null, [LEGACY_KEY]: key });
    }
    const malformed = [
      ['future-version', { v: 3, taken: [] }],
      ['future-record-with-parameter-candidate', { v: 3, taken: [], candidatePin: parameterPin }],
      ['backup-with-parameter-candidate', { format: 'kairo-backup', version: 1, record: { v: 2, taken: [] }, candidatePin: parameterPin }],
      ['future-version-without-taken-and-parameter-candidate', { v: 3, candidatePin: parameterPin }],
      ['missing-version', { taken: [] }],
      ['invalid-list-item', { v: 1, taken: [], lists: { saved: [{ t: 'word', id: 5 }] } }],
      ['invalid-observation', { v: 1, taken: [], obslog: [[1, 'sensei', 'word:学校', 4, 'misread', 'x']] }],
      ['invalid-evidence', { v: 1, taken: [], aiEvidence: { x: [{ surface: 'chat', role: 'system', content: 'untrusted', ts: 1 }] } }],
      ['invalid-evidence-marker', { v: 1, taken: [], aiEvidenceIncomplete: 'no' }],
      ['oversized-file', Buffer.alloc(32 * 1024 * 1024 + 1, 32)],
      ['excessive-node-count', { v: 1, taken: [], future: Array(500001).fill(null) }],
      ['excessive-depth', { v: 1, taken: [], future: Array.from({ length: 26 }).reduce((value) => [value], 0) }],
    ];
    for (const [name, value] of malformed) {
      await test(`reject-${name}`, async ({ page }) => {
        await seedArchive(page);
        const before = await state(page);
        await importRecord(page, value);
        assert.deepEqual(await state(page), before);
      });
    }
    await test('legacy-record-and-safe-future-data-roundtrip', async ({ page }) => {
      const imported = JSON.parse('{"v":1,"taken":[{"t":"word","id":"犬"}],"lists":{"__proto__":[{"t":"word","id":"猫"}]},"future":{"keep":[1,"yes"]},"aiEvidenceIncomplete":true,"aiEvidence":{"x":[{"surface":"chat","role":"user","content":"Synthetic imported exchange","ts":1700000000001}]}}');
      await importRecord(page, imported);
      const after = await state(page);
      const saved = JSON.parse(after.raw);
      assert.deepEqual(saved.taken, imported.taken);
      assert.deepEqual(saved.future, imported.future);
      assert.deepEqual(saved.lists, imported.lists);
      assert.equal(saved.aiEvidenceIncomplete, true);
      assert.equal(after.archive.length, 1);
      assert.equal(after.archive[0].content, 'Synthetic imported exchange');
      assert.equal(await page.locator('#store-alert').isVisible(), false);
    });
    await test('valid-parameter-file-keeps-the-learner-record', async ({ page }) => {
      await seedArchive(page);
      const before = await state(page);
      await importRecord(page, { candidatePin: parameterPin, input: { trainingReviews: 500 } });
      const after = await state(page);
      const saved = JSON.parse(after.raw);
      assert.deepEqual(saved.taken, seed.taken);
      assert.deepEqual(saved.srsPrefs.fsrs.w, parameterPin.w);
      assert.equal(saved.srsPrefs.fsrs.basedOnReviews, 500);
      assert.deepEqual(after.archive, before.archive);
    });
    await test('quota-failure-keeps-original-record-and-archive-atomic', async ({ page }) => {
      await seedArchive(page);
      const before = await state(page);
      await armRecordWriteFailure(page, 'quota', { roots: ['taken'] });
      await importRecord(page, { v: 1, taken: [{ t: 'word', id: '犬' }] });
      const fault = await clearRecordWriteFailure(page);
      assert.equal(fault.fired, 1, 'The real target restore transaction reached the quota fault');
      const after = await state(page);
      assert.deepEqual(after, before, 'The rejected transaction leaves record, archive, revision and source fences unchanged');
      assert.match(await page.locator('#store-alert').textContent(), /record is protected|could not be confirmed/);
      await page.reload();
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      assert.deepEqual(await state(page), before, 'Reload does not replay the rejected restore');
    });
    await test('export-excludes-legacy-provider-authority', async ({ page }) => {
      const saved = await exportRecord(page);
      assert.equal(Object.hasOwn(saved.record, 'ai'), false);
      assert.ok(!JSON.stringify(saved).includes(DEFAULT_CREDENTIAL));
      assert.deepEqual(saved.record.taken, seed.taken);
    }, { ...seed, ai: { baseUrl: 'https://legacy-recipient.invalid', model: 'legacy-model' } });
    await test('prototype-named-evidence-roundtrip', async ({ page }) => {
      const xids = ['__proto__', 'constructor'];
      const imported = {
        ...seed,
        obslog: xids.map((xid, i) => [1700000000000 + i, 'sensei', 'word:学校', 1, 'misread', xid]),
        aiEvidence: Object.fromEntries(xids.map((xid, i) => [xid, [{ surface: 'chat', role: 'user', content: `Synthetic ${xid} exchange`, ts: 1700000000000 + i }]])),
      };
      await importRecord(page, imported);
      const exported = await exportRecord(page);
      assert.deepEqual(exported.record.obslog, imported.obslog);
      assert.deepEqual(exported.archive.turns.map((row) => row.xid), xids);
      await importRecord(page, exported);
      const restored = await state(page);
      assert.deepEqual(JSON.parse(restored.raw).obslog, imported.obslog);
      assert.deepEqual(restored.archive.map((row) => row.xid), xids);
      assert.ok(restored.archive.every((row) => imported.aiEvidence[row.xid][0].content === row.content));
    });
    await test('explicit-custom-provider-and-origin-switch', async ({ page, calls }) => {
      await page.click('#ai-link');
      assert.equal(await page.inputValue('#ai-key-input'), DEFAULT_CREDENTIAL);
      await page.fill('#ai-base-url', 'https://custom-provider.invalid/proxy/');
      assert.equal(await page.inputValue('#ai-key-input'), '', 'switching origin clears the previous key');
      await page.fill('#ai-model-input', 'synthetic-custom-model');
      await page.fill('#ai-key-input', CUSTOM_CREDENTIAL);
      await page.click('#ai-key-save');
      await ask(page);
      assert.ok(calls.some((call) => call.origin === 'https://custom-provider.invalid' && call.pathname === '/proxy/v1/messages' && call.credential === 'custom-synthetic'));
      assert.ok(calls.every((call) => call.credential !== 'default-synthetic'));
      const configured = await page.evaluate((key) => localStorage.getItem(key), DEVICE_KEY);
      await importRecord(page, { ...seed, ai: { baseUrl: 'https://import-recipient.invalid', model: 'imported-model' } });
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), DEVICE_KEY), configured, 'restore cannot change device provider settings');
      await ask(page, 'The explicitly configured provider survives a restore.');
      assert.ok(calls.every((call) => call.origin === 'https://custom-provider.invalid' && call.credential === 'custom-synthetic'));
      await page.fill('#ai-base-url', 'https://second-provider.invalid');
      assert.equal(await page.inputValue('#ai-key-input'), '');
      await page.click('#ai-key-save');
      if (!await page.locator('#chat-input').count()) await page.click('#ai-link');
      await disconnectedDraft(page, calls, 'Synthetic question kept while the new origin needs its own key.');
      await page.fill('#ai-key-input', SECOND_CREDENTIAL);
      await page.click('#ai-key-save');
      await ask(page, 'A second explicit provider.');
      assert.ok(calls.some((call) => call.origin === 'https://second-provider.invalid' && call.credential === 'second-synthetic'));
      assert.ok(calls.every((call) => call.origin !== 'https://second-provider.invalid' || call.credential === 'second-synthetic'));
    });
    await test('malformed-provider-settings-preserve-configuration', async ({ page }) => {
      await page.click('#ai-link');
      const before = await page.evaluate((key) => localStorage.getItem(key), DEVICE_KEY);
      for (const url of ['http://unsafe.invalid', 'https://user:secret@unsafe.invalid', '/relative', 'https://unsafe.invalid?key=x', 'https://unsafe.invalid#route', 'https://unsafe.invalid\\elsewhere']) {
        await page.fill('#ai-base-url', url);
        await page.click('#ai-key-save');
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), DEVICE_KEY), before);
        assert.match(await page.locator('#ai-config-note').textContent(), /HTTPS/);
      }
    });
    await test('provider-redirect-is-not-followed', async ({ page, calls, behavior }) => {
      behavior.redirect = true;
      await ask(page);
      assert.ok(calls.length > 0);
      assert.ok(calls.every((call) => call.origin === DEFAULT_ORIGIN), JSON.stringify(calls));
      assert.match(await page.locator('.chat-log').textContent(), /reply could not be received/);
    });
    await test('mismatched-device-credential-origin-fails-closed', async ({ page, calls }) => {
      await page.click('#ai-link');
      await disconnectedDraft(page, calls, 'Synthetic question kept with a mismatched credential origin.');
      assert.equal(await page.inputValue('#ai-key-input'), '');
      assert.deepEqual(calls, []);
    }, seed, { [DEVICE_KEY]: JSON.stringify({ v: 1, baseUrl: 'https://one.invalid', model: 'synthetic', credential: { origin: 'https://different.invalid', key: CUSTOM_CREDENTIAL } }) });
  }
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}

if (!results.length) results.push({ name: CASE_FILTER || 'browser-matrix', pass: false, message: 'No test case matched.' });
const failures = results.filter((result) => !result.pass).length;
writeFileSync(resolve(OUTPUT, 'verify-import-provider.json'), `${JSON.stringify({ site: ROOT, simulatedBrowser: 'Chromium', onlySyntheticData: true, externalNetworkRequestsSent: 0, results, transport, failures }, null, 2)}\n`);
console.log(`Import/provider browser regressions: ${results.length - failures}/${results.length} passed.`);
process.exitCode = failures ? 1 : 0;
