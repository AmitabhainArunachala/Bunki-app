/** Real browser migration fixtures. No operator record, credential, transport,
 * or live migration is used. The runtime comes from the canonical stage. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const OUT = resolveCorridorEvidence();
const SITE = resolveCorridorSite();
const SELECTION = process.env.KAIRO_BROWSER || 'chromium';
assert(['chromium', 'webkit', 'all'].includes(SELECTION));
const FILTERS = new Set(process.argv.filter((arg) => arg.startsWith('--case=')).map((arg) => arg.slice(7)));
const CONTROLLER = readFileSync(resolve(SITE, 'record-controller.mjs'));
const CORE = readFileSync(resolve(SITE, 'modules/record-core.mjs'));
// This compatibility journey must execute the pre-migration app. Serving the
// current staged app here would test its recovery screen, not an older writer.
const LEGACY_REVISION = '124f08b3845c89bd874c0b0dabae91b9eb1466f5';
const LEGACY_APP = Object.fromEntries(['index.html', 'corridor.js', 'drift-layer.js'].map((file) => [file,
  execFileSync('git', ['show', `${LEGACY_REVISION}:prototypes/corridor/${file}`], {
    cwd: new URL('../../../', import.meta.url), maxBuffer: 20 * 1024 * 1024,
  }),
]));
const policy = {
  binding: { accountId: 'synthetic-account', learnerId: 'synthetic-learner', sessionId: 'synthetic-session' },
  schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1',
};
const actor = { deviceId: 'synthetic-mac', incarnationId: 'synthetic-installation' };
const record = JSON.parse('{"v":1,"taken":[],"srs":{},"revlog":[],"obslog":[],"__proto__":{"keep":"own-key"},"constructor":{"keep":"original"},"futureRoot":{"nested":{"keep":"unknown-json"}}}');
record.aiChat = Array.from({ length: 40 }, (_, index) => ({ role: index % 2 ? 'tutor' : 'user', text: `Original chat ${index}`, future: { context: index } }));
record.aiReadings = Array.from({ length: 20 }, (_, index) => ({ text: `Original article ${index}`, lv: 'N3', ts: 1700000000000 + index, candidates: { v: 1, wordIds: ['犬'] }, future: { source: index } }));
record.aiReading = null;
record.assessmentLibrary = { format: 'kairo-assessment-library', v: 1,
  scope: { accountId: policy.binding.accountId, learnerId: policy.binding.learnerId },
  forms: [], attempts: [], activeAttemptId: null, legacyEvidence: [] };
record.ai = { model: 'old-model-metadata', baseUrl: 'https://synthetic-provider.invalid', key: 'SYNTHETIC-SECRET-IN-LEGACY-AI' };
const archiveRows = Array.from({ length: 60 }, (_, index) => ({
  format: 'kairo-archive-row', v: 1, id: index * 2 + 1,
  turn: { id: index === 0 ? Number.MAX_SAFE_INTEGER : index === 1 ? '__proto__' : index === 2 ? 'constructor' : `turn-${index}`,
    surface: index % 2 ? 'word-tutor' : 'chat', role: index % 3 ? 'assistant' : 'user',
    content: `Original full archive ${index}`, ts: 1700000000000 + (index % 3), xid: `exchange-${Math.floor(index / 2)}`,
    contextRef: `word:犬-${index}`, future: { preserve: index } },
}));
const originalText = JSON.stringify(record, null, 2);
const originalDriftText = '{\n  "known":{"犬":1700000000000,"__proto__":{"keep":"judgment-own-key"}},"unknown":{"猫":{"future":"evidence"}},"lk":"41","lu":true,"__proto__":{"keep":"drift-own-root"},"constructor":{"keep":"drift-constructor"},"future":{"v":99,"values":[null,false,"unknown"]}\n}';
// Frozen deployed loader from drift-artifact.html before async-host conversion.
// It deliberately ignores version fields; exercise these exact bytes in a real
// browser with native localStorage. This fixture covers the storage boundary,
// not the separately verified gesture/animation path.

const LEGACY_DRIFT_LOADER = "const DRIFT_STORE_KEY=\"bunki-drift-v1\";\nconst plainRec=v=>!!v&&typeof v===\"object\"&&!Array.isArray(v);\nconst judgmentMap=v=>v==null||plainRec(v);\nconst optCounter=v=>v==null||Number.isFinite(Number(v));\nlet store={known:{},unknown:{},lk:0,lu:0};\nlet storeReadOnly=false;\nlet storeIssue=\"\";\ntry{const s=localStorage.getItem(DRIFT_STORE_KEY);\n  if(s){const o=JSON.parse(s);\n    if(!plainRec(o)||!judgmentMap(o.known)||!judgmentMap(o.unknown)||\n      !optCounter(o.lk)||!optCounter(o.lu)){\n      storeReadOnly=true;\n      storeIssue=\"端末のことば記録を保護中 — 判断は変更していません\";\n    }else{\n      store={...o,known:{...(o.known||{})},unknown:{...(o.unknown||{})},\n        lk:Number(o.lk)||0,lu:Number(o.lu)||0};\n    }\n  }}catch(err){\n    storeReadOnly=true;\n    storeIssue=\"端末のことば記録を保護中 — 判断は変更していません\";\n  }\nfunction saveStore(){\n  if(storeReadOnly){\n    setHint(storeIssue||\"端末のことば記録を保護中 — 判断は変更していません\");\n    return false;\n  }\n  try{\n    localStorage.setItem(DRIFT_STORE_KEY,JSON.stringify(store));\n    return true;\n  }catch(err){\n    setHint(\"この判断は保存できなかった。ことばはここに残した\");\n    return false;\n  }\n}\n";
const legacyDriftHtml = `<!doctype html><meta charset="utf-8"><button id="legacy-save">Save existing Drift state</button><output id="saved"></output><script>
const setHint = (value) => { window.legacyHint = value; };
${LEGACY_DRIFT_LOADER}
window.oldDrift = { get readOnly() { return storeReadOnly; }, get state() { return store; } };
document.querySelector('#legacy-save').onclick = () => { document.querySelector('#saved').textContent = String(saveStore()); };
</script>`;
const pageHtml = `<!doctype html><meta charset="utf-8"><title>Synthetic migration fixture</title>
<script type="module">
import * as controller from '/record-controller.mjs';
import * as core from '/modules/record-core.mjs';
window.fixture = { controller, core };
</script>`;
const server = createServer((request, response) => {
  response.setHeader('cache-control', 'no-store');
  if (request.url === '/record-controller.mjs') { response.setHeader('content-type', 'text/javascript'); response.end(CONTROLLER); }
  else if (request.url === '/modules/record-core.mjs') { response.setHeader('content-type', 'text/javascript'); response.end(CORE); }
  else if (request.url === '/legacy-drift-loader') { response.setHeader('content-type', 'text/html'); response.end(legacyDriftHtml); }
  else if (request.url === '/fixture') { response.setHeader('content-type', 'text/html'); response.end(pageHtml); }
  else {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
    if (!file.startsWith(`${SITE}/`) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' })[extname(file)] || 'application/octet-stream');
    response.end(readFileSync(file));
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
async function runEngine(ENGINE) {
const results = [];
const errors = [];
const network = [];
const engineOut = SELECTION === 'all' ? resolve(OUT, ENGINE) : OUT;
const browser = await ({ chromium, webkit }[ENGINE]).launch(ENGINE === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || undefined } : {});
const browserVersion = browser.version();

async function fixturePage(context) {
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/fixture`);
  await page.waitForFunction(() => !!window.fixture);
  return page;
}
async function seed(page) {
  await page.evaluate(async ({ recordText, rows }) => {
    localStorage.setItem('kairo-corridor-v1', recordText);
    localStorage.setItem('kairo-ai-key', 'SYNTHETIC-DEVICE-ONLY-LEGACY-KEY');
    localStorage.setItem('kairo-ai-provider-v1', JSON.stringify({ v: 1, baseUrl: 'https://synthetic-provider.invalid', model: 'synthetic', credential: { origin: 'https://synthetic-provider.invalid', key: 'SYNTHETIC-BOUND-DEVICE-KEY' } }));
    const db = await new Promise((done, fail) => {
      const request = indexedDB.open('kairo-ai-log', 3);
      request.onupgradeneeded = () => {
        const turns = request.result.createObjectStore('turns', { keyPath: 'id', autoIncrement: true });
        turns.createIndex('logical-id', 'turn.id');
        request.result.createObjectStore('imports', { keyPath: 'id' });
      };
      request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error);
    });
    await new Promise((done, fail) => {
      const tx = db.transaction('turns', 'readwrite', { durability: 'strict' });
      for (const row of rows) tx.objectStore('turns').add(row);
      tx.oncomplete = done; tx.onabort = () => fail(tx.error);
    });
    db.close();
  }, { recordText: originalText, rows: archiveRows });
}
async function own(page) {
  await page.evaluate(async ({ policy, actor }) => {
    let token = { ownerId: crypto.randomUUID(), epoch: 1, sessionId: policy.binding.sessionId };
    let owned = false;
    let release;
    await new Promise((done, fail) => {
      navigator.locks.request('kairo-record:kairo-corridor-v1:kairo-ai-log', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) { fail(new Error('Synthetic writer did not acquire record lock')); return; }
        owned = true;
        const lifetime = new Promise((resolve) => { release = resolve; });
        done(); await lifetime;
      }).catch(fail);
    });
    window.fixture.writer = { capture: () => ({ ...token }), assert: (captured) => owned && captured.ownerId === token.ownerId && captured.epoch === token.epoch && captured.sessionId === token.sessionId };
    window.fixture.release = () => { owned = false; token = { ...token, epoch: token.epoch + 1 }; release(); };
    window.fixture.changeSession = () => { token = { ...token, sessionId: 'different-session' }; };
    window.fixture.policy = policy; window.fixture.actor = actor;
    window.addEventListener('pagehide', window.fixture.release, { once: true });
  }, { policy, actor });
}
async function open(page, requireDrift = false) {
  await page.evaluate(async (requireDrift) => {
    const f = window.fixture;
    f.instance = await f.controller.createRecordController({ databaseName: 'synthetic-record-target', policy: f.policy, actor: f.actor, writer: f.writer, requireDrift });
  }, requireDrift);
}
async function prepare(page, includeDrift = false) {
  return page.evaluate(async (includeDrift) => {
    const f = window.fixture;
    f.source = await f.controller.captureLegacySource(f.writer, { includeDrift });
    return f.instance.prepare(f.source, { migrationId: 'migration-a' });
  }, includeDrift);
}
async function activate(page) { return page.evaluate(() => window.fixture.instance.activate('migration-a')); }
async function exact(page, action, argument) {
  const text = await page.evaluate(async ({ source, input }) => {
    // Only authored fixture functions are evaluated. Values cross as JSON text
    // so Playwright's object codec cannot discard an own __proto__ property.
    const run = (0, eval)(`(${source})`);
    return JSON.stringify({ value: await run(JSON.parse(input).value) });
  }, { source: String(action), input: JSON.stringify({ value: argument }) });
  return JSON.parse(text).value;
}
async function withDrift(page, text = originalDriftText) {
  await page.evaluate(async (text) => {
    if (text === null) localStorage.removeItem('bunki-drift-v1'); else localStorage.setItem('bunki-drift-v1', text);
    await window.fixture.instance.close();
  }, text);
  await open(page, true);
}
async function savedManifest(page) {
  return page.evaluate(async () => {
    const db = await new Promise((done) => { const request = indexedDB.open('synthetic-record-target'); request.onsuccess = () => done(request.result); });
    try {
      return await new Promise((done, fail) => {
        const tx = db.transaction('kairo_replication_rows'); const request = tx.objectStore('kairo_replication_rows').getAll();
        tx.oncomplete = () => done(JSON.parse(request.result.find((row) => row.kind === 'document' && JSON.parse(row.text).collection === 'kairo:migration').text).value);
        tx.onabort = () => fail(tx.error);
      });
    } finally { db.close(); }
  });
}
async function disk(page) {
  return page.evaluate(async () => {
    const read = async (name, store) => {
      const db = await new Promise((done, fail) => { const req = indexedDB.open(name); req.onsuccess = () => done(req.result); req.onerror = () => fail(req.error); });
      try { return await new Promise((done, fail) => { const tx = db.transaction(store, 'readonly'); const rows = tx.objectStore(store).getAll(); tx.oncomplete = () => done(rows.result); tx.onabort = () => fail(tx.error); }); }
      finally { db.close(); }
    };
    return { text: localStorage.getItem('kairo-corridor-v1'), driftText: localStorage.getItem('bunki-drift-v1'), rows: await read('kairo-ai-log', 'turns'), target: await read('synthetic-record-target', 'kairo_replication_rows'),
      provider: localStorage.getItem('kairo-ai-provider-v1'), oldKey: localStorage.getItem('kairo-ai-key') };
  });
}
async function arm(page, phase, mode) {
  await page.evaluate(({ phase, mode }) => {
    const f = window.fixture;
    const put = window.IDBObjectStore.prototype.put;
    const transaction = window.IDBDatabase.prototype.transaction;
    const setItem = Storage.prototype.setItem;
    let armed = true;
    f.fault = { phase, mode, fired: false };
    window.IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      if (this.name === 'synthetic-record-target' && args[1] === 'readwrite') tx.addEventListener('complete', () => {
        if (!armed) return;
        // eslint-disable-next-line no-debugger -- CDP crashes the real renderer at this exact completed transaction.
        if (mode === 'crash' && tx.__fixturePhase === phase) { f.fault.fired = true; armed = false; debugger; }
        if (mode === 'source-after-commit' && tx.__fixturePhase === 'delegated') {
          f.fault.fired = true; armed = false;
          setItem.call(localStorage, 'kairo-corridor-v1', JSON.stringify({ v: 1, taken: [], rogue: 'old-page-write-after-target-commit' }));
        }
        if (mode === 'source-drift-after-commit' && tx.__fixturePhase === 'drift-delegated') {
          f.fault.fired = true; armed = false;
          setItem.call(localStorage, 'bunki-drift-v1', '{"known":{"late-legacy-writer":true}}');
        }
      });
      return tx;
    };
    window.IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name !== 'kairo_replication_rows' || args[0]?.kind !== 'document') return request;
      const row = JSON.parse(args[0].text);
      const matched = row.collection === 'kairo:migration' ? row.value.phase : row.collection === 'local-note' ? 'delegated' : row.collection === 'learner-record' ? 'drift-delegated' : null;
      if (matched) this.transaction.__fixturePhase = matched;
      if (!armed || matched !== phase) return request;
      if (mode === 'quota') { armed = false; f.fault.fired = true; throw new DOMException('Synthetic target write failure', 'QuotaExceededError'); }
      if (mode === 'abort') request.addEventListener('success', () => { armed = false; f.fault.fired = true; this.transaction.abort(); });
      if (mode === 'writer-lost') this.transaction.addEventListener('complete', () => { armed = false; f.fault.fired = true; f.release(); });
      return request;
    };
    Storage.prototype.setItem = function (key, value) {
      const fence = ((phase === 'fenced' && key === 'kairo-corridor-v1') || (phase === 'drift-fenced' && key === 'bunki-drift-v1')) && JSON.parse(value)?.v === 2;
      if (armed && fence && mode === 'quota') { armed = false; f.fault.fired = true; throw new DOMException('Synthetic fence quota failure', 'QuotaExceededError'); }
      setItem.call(this, key, value);
      if (armed && fence && mode === 'writer-lost') { armed = false; f.fault.fired = true; f.release(); }
      if (armed && fence && mode === 'source-drift-after-fence') { armed = false; f.fault.fired = true; setItem.call(localStorage, 'bunki-drift-v1', '{"known":{"foreign":true},"unknown":{},"lk":1,"lu":0}'); }
      // eslint-disable-next-line no-debugger -- CDP crashes after the native LS fence write, before activation.
      if (armed && fence && mode === 'crash') { armed = false; f.fault.fired = true; debugger; }
    };
    f.disarm = () => { armed = false; window.IDBObjectStore.prototype.put = put; window.IDBDatabase.prototype.transaction = transaction; Storage.prototype.setItem = setItem; };
  }, { phase, mode });
}
async function test(name, body) {
  if (FILTERS.size && !FILTERS.has(name)) return;
  const started = Date.now();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    network.push(url.origin); return route.abort();
  });
  try {
    const page = await fixturePage(context); await seed(page); await own(page); await open(page);
    await body({ context, page });
    results.push({ name, status: 'passed' });
  } catch (error) { results.push({ name, status: 'failed', error: String(error.stack || error) }); }
  finally { await context.close(); process.stdout.write(`${results.at(-1).status}: ${name} (${Date.now() - started} ms)\n`); }
}

try {
  await test('complete-custody-before-activation-and-empty-outbox', async ({ page }) => {
    assert.equal((await page.evaluate(() => window.fixture.instance.resume())).status, 'legacy');
    const before = await disk(page);
    assert.equal((await prepare(page)).status, 'prepared');
    const staged = await disk(page); assert.equal(staged.text, originalText); assert.deepEqual(staged.rows, archiveRows);
    const custody = await page.evaluate(() => window.fixture.instance.localCustody());
    assert.equal(custody.localOnly, true); assert.equal(custody.portable, false);
    assert.equal(custody.source.recordText, originalText); assert.deepEqual(custody.source.archive.rows, archiveRows);
    assert.deepEqual(custody.source.counts, { archiveTurns: 60, chatTurns: 40, readingVersions: 20 });
    assert.equal((await page.evaluate(() => window.fixture.instance.snapshot())).status, 'prepared');
    assert.equal((await activate(page)).status, 'active');
    const normal = await page.evaluate(async () => JSON.stringify(await window.fixture.instance.snapshot()));
    assert(!normal.includes('SYNTHETIC-SECRET-IN-LEGACY-AI')); assert(!normal.includes('SYNTHETIC-BOUND-DEVICE-KEY')); assert(!normal.includes('SYNTHETIC-DEVICE-ONLY-LEGACY-KEY'));
    const snapshot = JSON.parse(normal).snapshot;
    assert.equal(snapshot.outbox.length, 0); assert.equal(snapshot.replica.operations.length, 0); assert.equal(snapshot.actor.sequence, 0);
    const learner = snapshot.documents.find((row) => row.collection === 'learner-record').value;
    assert.equal(learner.aiChat.length, 40); assert.equal(learner.aiReadings.length, 20);
    assert.deepEqual(learner.assessmentLibrary, record.assessmentLibrary);
    assert.equal(learner['__proto__'].keep, 'own-key'); assert.equal(learner.constructor.keep, 'original'); assert.equal(learner.futureRoot.nested.keep, 'unknown-json'); assert.equal(learner.ai, undefined);
    assert.deepEqual(snapshot.documents.find((row) => row.collection === 'learner-archive').value.turns, archiveRows.map((row) => row.turn));
    const after = await disk(page); assert.equal(JSON.parse(after.text).v, 2); assert.deepEqual(after.rows, before.rows);
    assert.equal(after.provider, before.provider); assert.equal(after.oldKey, before.oldKey);
  });
  await test('partial-archive-and-forged-counts-are-refused-before-mutation', async ({ page }) => {
    const before = await disk(page);
    const partial = await page.evaluate(async () => {
      const f = window.fixture; const full = await f.controller.captureLegacySource(f.writer);
      const partial = f.controller.legacySourceSnapshot({ recordText: full.recordText, archiveRows: full.archive.rows.slice(1) });
      return f.instance.prepare(partial, { migrationId: 'migration-a' });
    });
    assert.equal(partial.status, 'source-changed');
    await assert.rejects(page.evaluate(async () => { const f = window.fixture; const source = structuredClone(await f.controller.captureLegacySource(f.writer)); source.counts.archiveTurns -= 1; return f.instance.prepare(source, { migrationId: 'migration-a' }); }), /inconsistent-source/u);
    await assert.rejects(page.evaluate(async () => { const f = window.fixture; const source = structuredClone(await f.controller.captureLegacySource(f.writer)); source.completeness = 'incomplete'; return f.instance.prepare(source, { migrationId: 'migration-a' }); }), /incomplete-source/u);
    assert.deepEqual(await disk(page), before);
  });
  await test('pending-import-journal-refuses-capture-without-discarding-evidence', async ({ page }) => {
    await page.evaluate(async () => {
      const db = await new Promise((done) => { const req = indexedDB.open('kairo-ai-log'); req.onsuccess = () => done(req.result); });
      await new Promise((done) => { const tx = db.transaction('imports', 'readwrite');
        tx.objectStore('imports').add({ id: 'active', token: 'unresolved-import', beforeText: 'original-evidence', afterText: 'pending-evidence', beforeRows: [], afterRows: [] }); tx.oncomplete = done; }); db.close();
    });
    const before = await disk(page);
    await assert.rejects(prepare(page), /incomplete-source/u);
    assert.deepEqual(await disk(page), before);
    const journal = await page.evaluate(async () => {
      const db = await new Promise((done) => { const req = indexedDB.open('kairo-ai-log'); req.onsuccess = () => done(req.result); });
      const value = await new Promise((done) => { const tx = db.transaction('imports'); const req = tx.objectStore('imports').get('active'); tx.oncomplete = () => done(req.result); }); db.close(); return value;
    });
    assert.equal(journal.token, 'unresolved-import'); assert.equal(journal.beforeText, 'original-evidence');
  });
  await test('future-archive-version-is-neither-read-as-v3-nor-reset', async ({ page }) => {
    await page.evaluate(async () => {
      const db = await new Promise((done) => { const req = indexedDB.open('kairo-ai-log', 99); req.onsuccess = () => done(req.result); }); db.close();
    });
    const before = await disk(page);
    await assert.rejects(prepare(page), /unsupported-archive/u);
    assert.deepEqual(await disk(page), before);
  });
  await test('complete-source-too-large-for-atomic-duplicated-custody-is-refused', async ({ page }) => {
    await page.evaluate(async () => {
      const db = await new Promise((done) => { const req = indexedDB.open('kairo-ai-log'); req.onsuccess = () => done(req.result); });
      await new Promise((done) => { const tx = db.transaction('turns', 'readwrite'); const store = tx.objectStore('turns'); const req = store.get(1);
        req.onsuccess = () => { const row = req.result; row.turn.content = '大'.repeat(17 * 1024 * 1024); store.put(row); }; tx.oncomplete = done; }); db.close();
    });
    await assert.rejects(prepare(page), /invalid-request/u);
    const result = await page.evaluate(async () => {
      const f = window.fixture;
      const current = await f.controller.captureLegacySource(f.writer);
      return { original: localStorage.getItem('kairo-corridor-v1') === f.source.recordText,
        sourceUnchanged: current.sha256.source === f.source.sha256.source, count: current.counts.archiveTurns,
        status: await f.instance.resume(), custody: await f.instance.localCustody() };
    });
    assert.equal(result.original, true); assert.equal(result.sourceUnchanged, true); assert.equal(result.count, 60);
    assert.equal(result.status.status, 'legacy'); assert.equal(result.custody.source, null);
  });
  await test('changed-source-before-prepare-is-not-fenced', async ({ page }) => {
    await page.evaluate(async () => { const f = window.fixture; f.source = await f.controller.captureLegacySource(f.writer); const record = JSON.parse(f.source.recordText); record.futureRoot.changed = true; localStorage.setItem('kairo-corridor-v1', JSON.stringify(record)); });
    const changed = await disk(page);
    const result = await page.evaluate(() => window.fixture.instance.prepare(window.fixture.source, { migrationId: 'migration-a' }));
    assert.equal(result.status, 'source-changed'); assert.deepEqual(await disk(page), changed);
  });
  for (const target of ['record', 'archive']) await test(`changed-${target}-after-prepare-is-quarantined`, async ({ page }) => {
    await prepare(page);
    await page.evaluate(async (target) => {
      if (target === 'record') { localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1, taken: [], foreign: 'preserve-this' })); return; }
      const db = await new Promise((done) => { const request = indexedDB.open('kairo-ai-log'); request.onsuccess = () => done(request.result); });
      await new Promise((done) => { const tx = db.transaction('turns', 'readwrite'); tx.objectStore('turns').add({ format: 'kairo-archive-row', v: 1, id: 200, turn: { surface: 'chat', role: 'user', content: 'Foreign late archive', ts: 1700000009999 } }); tx.oncomplete = done; }); db.close();
    }, target);
    const changed = await disk(page);
    const outcome = await activate(page); assert.equal(outcome.status, 'quarantined'); assert.equal(outcome.quarantinePersisted, true);
    const after = await disk(page); assert.equal(after.text, changed.text); assert.deepEqual(after.rows, changed.rows);
    assert.equal((await page.evaluate(() => window.fixture.instance.localCustody())).source.recordText, originalText);
    assert.equal((await page.evaluate(() => window.fixture.instance.resume())).status, 'quarantined');
  });
  for (const mode of ['abort', 'quota']) await test(`failed-prepare-${mode}-keeps-legacy-authoritative`, async ({ page }) => {
    const before = await disk(page); await arm(page, 'prepared', mode);
    assert.equal((await prepare(page)).status, 'recovery-required');
    assert.equal(await page.evaluate(() => window.fixture.fault.fired), true);
    await page.evaluate(() => window.fixture.disarm());
    assert.deepEqual(await disk(page), before);
    assert.equal((await page.evaluate(() => window.fixture.instance.resume())).status, 'legacy');
    assert.equal((await prepare(page)).status, 'prepared'); assert.equal((await activate(page)).status, 'active');
  });
  for (const phase of ['intent', 'fenced', 'active']) await test(`failed-${phase}-resumes-from-complete-custody`, async ({ page }) => {
    await prepare(page); await arm(page, phase, 'quota');
    const failed = await activate(page); assert.equal(failed.status, 'recovery-required');
    assert.equal(await page.evaluate(() => window.fixture.fault.fired), true);
    await page.evaluate(() => window.fixture.disarm());
    const saved = await disk(page);
    assert.equal(JSON.parse(saved.text).v, phase === 'active' ? 2 : 1);
    assert.deepEqual(saved.rows, archiveRows);
    assert.equal((await page.evaluate(() => window.fixture.instance.localCustody())).source.recordText, originalText);
    const resumed = await page.evaluate(() => window.fixture.instance.resume());
    assert.equal(resumed.status, phase === 'active' ? 'recovery-required' : 'prepared');
    assert.equal((await activate(page)).status, 'active');
  });
  await test('repeated-resume-prepare-and-activate-do-not-create-another-generation', async ({ page }) => {
    await prepare(page); await activate(page);
    const before = await disk(page);
    for (let index = 0; index < 3; index++) {
      assert.equal((await page.evaluate(() => window.fixture.instance.resume())).status, 'active');
      assert.equal((await page.evaluate(() => window.fixture.instance.prepare(window.fixture.source, { migrationId: 'migration-a' }))).status, 'active');
      assert.equal((await activate(page)).status, 'active');
    }
    assert.deepEqual(await disk(page), before);
    await assert.rejects(page.evaluate(() => window.fixture.instance.prepare(window.fixture.source, { migrationId: 'another-generation' })), /migration-conflict/u);
    assert.deepEqual(await disk(page), before);
  });
  await test('active-generation-survives-real-reload-with-complete-custody', async ({ page }) => {
    await prepare(page); await activate(page);
    const before = await page.evaluate(() => window.fixture.instance.snapshot());
    await page.reload(); await page.waitForFunction(() => !!window.fixture); await own(page); await open(page);
    const after = await page.evaluate(() => window.fixture.instance.snapshot());
    assert.deepEqual(after, before);
    const custody = await page.evaluate(() => window.fixture.instance.localCustody());
    assert.equal(custody.source.recordText, originalText); assert.deepEqual(custody.source.archive.rows, archiveRows);
    assert.deepEqual((await disk(page)).rows, archiveRows);
  });
  for (const phase of ['prepared', 'intent', 'active']) await test(`writer-lost-after-${phase}-commit-requires-new-owner-recovery`, async ({ page, context }) => {
    if (phase !== 'prepared') await prepare(page);
    await arm(page, phase, 'writer-lost');
    const result = phase === 'prepared' ? await prepare(page) : await activate(page);
    assert.equal(result.status, 'recovery-required');
    assert.equal(await page.evaluate(() => window.fixture.fault.fired), true);
    await page.evaluate(() => window.fixture.disarm());
    const next = await fixturePage(context); await own(next); await open(next);
    const resumed = await next.evaluate(() => window.fixture.instance.resume());
    assert.equal(resumed.status, phase === 'active' ? 'active' : 'prepared');
    assert.equal((await activate(next)).status, 'active');
    assert.equal((await next.evaluate(() => window.fixture.instance.localCustody())).source.recordText, originalText);
    assert.deepEqual((await disk(next)).rows, archiveRows);
  });
  await test('fresh-writer-resumes-prepared-source-after-owner-relinquishes', async ({ page, context }) => {
    await prepare(page); await page.evaluate(() => window.fixture.release());
    await assert.rejects(activate(page), /writer-required/u);
    const next = await fixturePage(context); await own(next); await open(next);
    assert.equal((await next.evaluate(() => window.fixture.instance.resume())).status, 'prepared');
    assert.equal((await activate(next)).status, 'active');
    assert.equal((await next.evaluate(() => window.fixture.instance.localCustody())).source.recordText, originalText);
  });
  await test('captured-session-change-refuses-activation', async ({ page }) => {
    await prepare(page); const before = await disk(page);
    await page.evaluate(() => window.fixture.changeSession());
    await assert.rejects(activate(page), /session-changed/u);
    assert.deepEqual(await disk(page), before);
  });
  await test('future-legacy-marker-without-custody-is-quarantined', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 99, unknownFuture: 'untouched' })));
    const before = await disk(page);
    assert.equal((await page.evaluate(() => window.fixture.instance.resume())).status, 'quarantined');
    assert.deepEqual(await disk(page), before);
  });
  await test('unknown-target-migration-version-does-not-reset-custody', async ({ page }) => {
    await prepare(page);
    await page.evaluate(async () => {
      const f = window.fixture;
      const db = await new Promise((done) => { const req = indexedDB.open('synthetic-record-target'); req.onsuccess = () => done(req.result); });
      await new Promise((done) => {
        const tx = db.transaction('kairo_replication_rows', 'readwrite'); const store = tx.objectStore('kairo_replication_rows'); const req = store.getAll();
        req.onsuccess = () => { const row = req.result.find((row) => row.kind === 'document' && JSON.parse(row.text).collection === 'kairo:migration'); const value = JSON.parse(row.text); value.value.version = 99; const encoded = f.core.encodeLocalJson(value); row.text = encoded.text; row.sha256 = encoded.sha256; store.put(row); }; tx.oncomplete = done;
      }); db.close();
    });
    const before = await disk(page);
    await assert.rejects(page.evaluate(() => window.fixture.instance.resume()), /unsupported-migration/u);
    assert.deepEqual(await disk(page), before);
  });
  await test('active-local-and-incoming-changes-use-the-transactional-port-only', async ({ page }) => {
    await prepare(page); await activate(page);
    const legacyBefore = await disk(page);
    const result = await page.evaluate(async () => {
      const f = window.fixture;
      const before = (await f.instance.snapshot()).snapshot;
      const note = { kind: 'note.version', noteId: 'note-a', versionId: 'version-a', generation: null, supersedes: [], segments: [{ kind: 'original', text: 'Explicit synthetic local note' }] };
      const local = await f.instance.commitLocal({ changeId: 'local-a', binding: f.policy.binding, expectedRevision: before.revision, occurredAt: '2026-09-10T00:00:00.000Z',
        mutations: [{ kind: 'put', collection: 'local-note', id: 'a', value: { original: 'User-authored note' } }], operations: [{ payload: note, dependencies: [] }] });
      const remote = await f.core.IndexedDbReplicationStore.open({ databaseName: 'synthetic-remote', policy: f.policy, actor: { deviceId: 'phone', incarnationId: 'fresh' } });
      await remote.commitLocal({ changeId: 'remote-a', binding: f.policy.binding, expectedRevision: 0, occurredAt: '2026-09-10T00:00:00.000Z', mutations: [],
        operations: [{ payload: { ...note, noteId: 'remote-note', versionId: 'remote-version' }, dependencies: [] }] });
      const operations = (await remote.snapshot()).outbox; await remote.close();
      const incoming = await f.instance.commitReceive({ deliveryId: 'delivery-a', expectedRevision: local.receipt.committedRevision,
        delivery: { binding: f.policy.binding, operations }, checkpoint: { channelId: 'synthetic', expected: null, next: 'cursor-a' } });
      const ack = await f.instance.acknowledgeOutbox({ acknowledgementId: 'ack-a', binding: f.policy.binding, expectedRevision: incoming.receipt.committedRevision, operations: local.receipt.operations });
      return { local, incoming, ack, current: await f.instance.snapshot() };
    });
    assert.equal(result.local.status, 'active'); assert.equal(result.incoming.status, 'active'); assert.equal(result.ack.status, 'active');
    assert.equal(result.current.snapshot.replica.operations.length, 2); assert.equal(result.current.snapshot.outbox.length, 0);
    assert.equal(result.current.snapshot.acknowledgedOutbox.length, 1); assert.equal(result.current.snapshot.inbox.length, 1);
    const legacyAfter = await disk(page); assert.equal(legacyAfter.text, legacyBefore.text); assert.deepEqual(legacyAfter.rows, legacyBefore.rows);
    await assert.rejects(page.evaluate(async () => { const f = window.fixture; return f.instance.commitLocal({ changeId: 'bad', binding: f.policy.binding, expectedRevision: (await f.instance.snapshot()).snapshot.revision,
      occurredAt: '2026-09-10T00:00:00.000Z', operations: [], mutations: [{ kind: 'delete', collection: 'kairo:migration-custody', id: 'migration-a' }] }); }), /reserved-migration-data/u);
  });
  await test('rogue-legacy-write-after-target-commit-reports-both-durable-result-and-quarantine', async ({ page }) => {
    await prepare(page); await activate(page); await arm(page, 'delegated', 'source-after-commit');
    const result = await page.evaluate(async () => { const f = window.fixture; return f.instance.commitLocal({ changeId: 'local-race', binding: f.policy.binding,
      expectedRevision: (await f.instance.snapshot()).snapshot.revision, occurredAt: '2026-09-10T00:00:00.000Z',
      mutations: [{ kind: 'put', collection: 'local-note', id: 'race', value: 'Acknowledged in target before rogue legacy write' }], operations: [] }); });
    assert.equal(result.status, 'quarantined'); assert.equal(result.targetCommitDurable, true); assert.equal(result.targetReceipt.outcome, 'committed');
    const saved = await disk(page); assert.equal(JSON.parse(saved.text).rogue, 'old-page-write-after-target-commit');
    assert(saved.target.some((row) => row.text.includes('Acknowledged in target before rogue legacy write')));
    assert.equal((await page.evaluate(() => window.fixture.instance.localCustody())).source.recordText, originalText);
  });
  await test('future-fence-stops-the-existing-legacy-app-on-boot', async ({ page, context }) => {
    await prepare(page); await activate(page); const before = await disk(page);
    await page.evaluate(async () => { await window.fixture.instance.close(); window.fixture.release(); });
    const old = await context.newPage(); old.on('pageerror', (error) => errors.push(error.message));
    for (const [file, bytes] of Object.entries(LEGACY_APP)) await old.route(`${origin}/${file}*`, (route) => route.fulfill({
      body: bytes, contentType: file.endsWith('.html') ? 'text/html' : 'text/javascript',
    }));
    await old.goto(`${origin}/index.html?entry=shelf&ui=bi`);
    await old.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
    assert.match(await old.locator('#store-alert').innerText(), /newer version|新しい版/u);
    assert.equal(await old.evaluate(() => window.__KAIRO_AI__.__seed({ surface: 'chat', role: 'user', content: 'Must not append through old app', ts: 1700000009999 })), false);
    const after = await disk(old); assert.equal(after.text, before.text); assert.deepEqual(after.rows, before.rows);
  });
  await test('drift-baseline-v1-custody-excludes-separate-legacy-key-explicitly', async ({ page }) => {
    await page.evaluate((text) => localStorage.setItem('bunki-drift-v1', text), originalDriftText);
    const result = await prepare(page);
    assert.deepEqual(result.sourceCoverage, ['record', 'archive']);
    const custody = await page.evaluate(() => window.fixture.instance.localCustody());
    assert.equal(custody.source.version, 1); assert.equal(Object.hasOwn(custody.source, 'legacyDriftText'), false);
    await activate(page);
    const normal = await exact(page, () => window.fixture.instance.snapshot());
    assert.equal(Object.hasOwn(normal.snapshot.documents.find((row) => row.collection === 'learner-record').value, 'driftState'), false);
    assert.equal((await disk(page)).driftText, originalDriftText);
  });
  await test('drift-real-legacy-loader-overwrites-version-only-marker', async ({ page, context }) => {
    const marker = JSON.stringify({ v: 2, format: 'kairo-transactional-drift', version: 1, sourceSha256: 'synthetic' });
    await page.evaluate((text) => localStorage.setItem('bunki-drift-v1', text), marker);
    const old = await context.newPage(); old.on('pageerror', (error) => errors.push(error.message));
    await old.goto(`${origin}/legacy-drift-loader`);
    assert.equal(await old.evaluate(() => window.oldDrift.readOnly), false);
    await old.locator('#legacy-save').click(); assert.equal(await old.locator('#saved').innerText(), 'true');
    const after = await old.evaluate(() => localStorage.getItem('bunki-drift-v1'));
    assert.notEqual(after, marker); assert.deepEqual(JSON.parse(after).known, {});
  });
  await test('drift-v2-complete-custody-matches-deployed-normalization-and-reloads', async ({ page, context }) => {
    await withDrift(page);
    const old = await context.newPage(); old.on('pageerror', (error) => errors.push(error.message));
    await old.goto(`${origin}/legacy-drift-loader`);
    const legacyState = JSON.parse(await old.evaluate(() => JSON.stringify(window.oldDrift.state)));
    assert.equal(await old.evaluate(() => window.oldDrift.readOnly), false); await old.close();
    const before = await disk(page);
    const prepared = await prepare(page, true);
    assert.equal(prepared.status, 'prepared'); assert.deepEqual(prepared.sourceCoverage, ['record', 'archive', 'drift']);
    const custody = await exact(page, () => window.fixture.instance.localCustody());
    assert.equal(custody.source.version, 2); assert.equal(custody.source.legacyDriftText, originalDriftText);
    assert.deepEqual(custody.source.archive.rows, archiveRows); assert.equal(custody.source.recordText, originalText);
    assert.deepEqual(custody.source.counts, { archiveTurns: 60, chatTurns: 40, readingVersions: 20, driftKnownKeys: 2, driftUnknownKeys: 1 });
    const parsed = await exact(page, (text) => window.fixture.controller.parseLegacyDriftText(text), originalDriftText);
    assert.deepEqual(parsed.store, legacyState); assert.equal(parsed.store.lk, 41); assert.equal(parsed.store.lu, 1);
    assert.equal(Object.hasOwn(parsed.store, '__proto__'), true); assert.equal(parsed.store.constructor.keep, 'drift-constructor');
    assert.equal((await disk(page)).driftText, originalDriftText);
    assert.equal((await activate(page)).status, 'active');
    const active = await exact(page, () => window.fixture.instance.snapshot());
    const learner = active.snapshot.documents.find((row) => row.collection === 'learner-record').value;
    assert.deepEqual(learner.driftState, parsed); assert.equal(learner.aiChat.length, 40); assert.equal(learner.aiReadings.length, 20);
    assert.deepEqual(learner.assessmentLibrary, record.assessmentLibrary); assert.deepEqual(learner.revlog, []); assert.deepEqual(learner.srs, {});
    assert.deepEqual(active.snapshot.outbox, []); assert.deepEqual(active.snapshot.replica.operations, []); assert.equal(active.snapshot.actor.sequence, 0);
    const after = await disk(page); assert.equal(JSON.parse(after.driftText).known, false); assert.equal(JSON.parse(after.text).version, 2);
    assert.deepEqual(after.rows, before.rows); assert.equal(after.oldKey, before.oldKey); assert.equal(after.provider, before.provider);
    await page.reload(); await page.waitForFunction(() => !!window.fixture); await own(page); await open(page, true);
    assert.deepEqual(await exact(page, () => window.fixture.instance.snapshot()), active);
    assert.deepEqual(await exact(page, () => window.fixture.instance.localCustody()), custody);
  });
  await test('drift-actual-legacy-loader-refuses-new-fence-without-changing-bytes', async ({ page, context }) => {
    await withDrift(page); await prepare(page, true); await activate(page); const before = await disk(page);
    const old = await context.newPage(); old.on('pageerror', (error) => errors.push(error.message));
    await old.goto(`${origin}/legacy-drift-loader`);
    assert.equal(await old.evaluate(() => window.oldDrift.readOnly), true);
    await old.locator('#legacy-save').click(); assert.equal(await old.locator('#saved').innerText(), 'false');
    assert.match(await old.evaluate(() => window.legacyHint), /記録を保護中/u);
    assert.deepEqual(await disk(page), before);
  });
  for (const absent of [null, '']) await test(`drift-${absent === null ? 'absent' : 'empty'}-bytes-are-distinct-and-preserved`, async ({ page }) => {
    await withDrift(page, absent); await prepare(page, true); await activate(page);
    const result = await exact(page, async () => ({ custody: await window.fixture.instance.localCustody(), current: await window.fixture.instance.snapshot() }));
    assert.equal(result.custody.source.legacyDriftText, absent);
    assert.deepEqual(result.current.snapshot.documents.find((row) => row.collection === 'learner-record').value.driftState.store, { known: {}, unknown: {}, lk: 0, lu: 0 });
    const digests = await page.evaluate(() => ({ absent: window.fixture.controller.parseLegacyDriftText(null), empty: window.fixture.controller.parseLegacyDriftText(''), nullHash: window.fixture.core.encodeLocalJson(null).sha256, emptyHash: window.fixture.core.encodeLocalJson('').sha256 }));
    assert.deepEqual(digests.absent, digests.empty); assert.notEqual(digests.nullHash, digests.emptyHash);
    await page.evaluate(() => localStorage.setItem('bunki-drift-v1', '{"known":{"late":true}}'));
    assert.equal((await page.evaluate(() => window.fixture.instance.resume())).status, 'quarantined');
    assert.equal((await page.evaluate(() => window.fixture.instance.localCustody())).source.legacyDriftText, absent);
  });
  await test('drift-codec-rejects-unreadable-shapes-and-unknown-active-versions', async ({ page }) => {
    const before = await disk(page);
    for (const text of ['{', 'null', '[]', '{"known":false}', '{"unknown":[]}', '{"lk":"NaN"}', '{"lu":{}}'])
      await assert.rejects(page.evaluate((text) => window.fixture.controller.parseLegacyDriftText(text), text), /unsupported-legacy-drift/u);
    await assert.rejects(page.evaluate(() => window.fixture.controller.parseDriftState({ format: 'kairo-drift-state', version: 99, store: { known: {}, unknown: {}, lk: 0, lu: 0 } })), /unsupported-drift-state/u);
    await assert.rejects(page.evaluate(() => window.fixture.controller.parseDriftState({ format: 'kairo-drift-state', version: 1, store: { known: {}, unknown: {}, lk: '1', lu: 0 } })), /noncanonical-drift-state/u);
    await assert.rejects(page.evaluate(() => window.fixture.controller.readDriftState({})), /drift-state-unavailable/u);
    assert.deepEqual(await disk(page), before);
  });
  await test('drift-tampered-hash-count-coverage-and-conflicting-existing-root-refused', async ({ page }) => {
    await withDrift(page); const before = await disk(page);
    for (const target of ['text', 'hash', 'count', 'missing', 'version']) await assert.rejects(page.evaluate(async (target) => {
      const f = window.fixture; const source = structuredClone(await f.controller.captureLegacySource(f.writer, { includeDrift: true }));
      if (target === 'text') source.legacyDriftText += ' ';
      if (target === 'hash') source.sha256.driftState = '0'.repeat(64);
      if (target === 'count') source.counts.driftKnownKeys += 1;
      if (target === 'missing') delete source.legacyDriftText;
      if (target === 'version') source.version = 99;
      return f.instance.prepare(source, { migrationId: 'migration-a' });
    }, target), /inconsistent-source|invalid-source|incomplete-source/u);
    await assert.rejects(page.evaluate(async () => {
      const f = window.fixture; const source = await f.controller.captureLegacySource(f.writer, { includeDrift: true });
      const record = JSON.parse(source.recordText); record.driftState = { must: 'not-be-overwritten' };
      return f.controller.legacySourceSnapshot({ recordText: JSON.stringify(record), archiveRows: source.archive.rows, legacyDriftText: source.legacyDriftText });
    }), /drift-root-conflict/u);
    assert.deepEqual(await disk(page), before);
  });
  await test('drift-source-change-before-prepare-preserves-foreign-bytes', async ({ page }) => {
    await withDrift(page);
    await page.evaluate(async () => { const f = window.fixture; f.source = await f.controller.captureLegacySource(f.writer, { includeDrift: true }); localStorage.setItem('bunki-drift-v1', '{"known":{"foreign":true}}'); });
    const before = await disk(page);
    const result = await page.evaluate(() => window.fixture.instance.prepare(window.fixture.source, { migrationId: 'migration-a' }));
    assert.equal(result.status, 'source-changed'); assert.deepEqual(await disk(page), before);
  });
  await test('drift-source-change-after-prepare-quarantines-without-writing-fences', async ({ page }) => {
    await withDrift(page); await prepare(page, true);
    await page.evaluate(() => localStorage.setItem('bunki-drift-v1', '{"known":{"foreign":true}}'));
    const before = await disk(page); const result = await activate(page);
    assert.equal(result.status, 'quarantined'); assert.equal(result.reason, 'legacy-drift-diverged');
    const after = await disk(page); assert.equal(after.text, before.text); assert.equal(after.driftText, before.driftText); assert.deepEqual(after.rows, before.rows);
    assert.equal((await page.evaluate(() => window.fixture.instance.localCustody())).source.legacyDriftText, originalDriftText);
  });
  for (const phase of ['prepared', 'active']) await test(`drift-required-blocks-older-${phase}-generation-without-upgrading`, async ({ page }) => {
    await page.evaluate((text) => localStorage.setItem('bunki-drift-v1', text), originalDriftText);
    await prepare(page); if (phase === 'active') await activate(page);
    await page.evaluate(() => window.fixture.instance.close()); await open(page, true);
    const before = await disk(page);
    for (const method of ['resume', 'snapshot', 'activate']) {
      const result = await page.evaluate((method) => window.fixture.instance[method]('migration-a'), method);
      assert.equal(result.status, 'recovery-required'); assert.equal(result.reason, 'drift-migration-required'); assert.equal(result.retryable, false);
      assert.deepEqual(result.sourceCoverage, ['record', 'archive']); assert.equal(result.snapshot, undefined);
    }
    await assert.rejects(page.evaluate(() => window.fixture.instance.prepare(window.fixture.source, { migrationId: 'migration-a' })), /drift-source-required/u);
    assert.deepEqual(await disk(page), before);
    await page.evaluate(() => window.fixture.instance.close()); await open(page);
    assert.equal((await page.evaluate(() => window.fixture.instance.resume())).status, phase);
  });
  for (const phase of ['prepared', 'intent', 'active']) for (const mode of ['abort', 'quota']) await test(`drift-${phase}-${mode}-never-leaves-partial-target-custody`, async ({ page }) => {
    await withDrift(page); if (phase !== 'prepared') await prepare(page, true);
    const before = await disk(page); await arm(page, phase, mode);
    const result = phase === 'prepared' ? await prepare(page, true) : await activate(page);
    assert.equal(result.status, 'recovery-required'); assert.equal(await page.evaluate(() => window.fixture.fault.fired), true);
    await page.evaluate(() => window.fixture.disarm());
    const after = await disk(page);
    if (phase !== 'active') assert.deepEqual(after, before);
    else { assert.equal(JSON.parse(after.text).version, 2); assert.equal(JSON.parse(after.driftText).known, false); }
    if (phase === 'prepared') await prepare(page, true);
    assert.equal((await activate(page)).status, 'active');
    assert.equal((await page.evaluate(() => window.fixture.instance.localCustody())).source.legacyDriftText, originalDriftText);
  });
  for (const phase of ['fenced', 'drift-fenced']) await test(`drift-${phase}-quota-recovers-from-separate-LS-write`, async ({ page }) => {
    await withDrift(page); await prepare(page, true); await arm(page, phase, 'quota');
    assert.equal((await activate(page)).status, 'recovery-required'); assert.equal(await page.evaluate(() => window.fixture.fault.fired), true);
    await page.evaluate(() => window.fixture.disarm()); const before = await disk(page);
    assert.equal(before.driftText, originalDriftText); assert.equal(JSON.parse(before.text).v, phase === 'fenced' ? 1 : 2);
    const resumed = await page.evaluate(() => window.fixture.instance.resume());
    assert.equal(resumed.status, phase === 'fenced' ? 'prepared' : 'recovery-required');
    if (phase === 'drift-fenced') assert.equal(resumed.reason, 'partial-fences');
    assert.equal((await activate(page)).status, 'active');
  });
  for (const phase of ['fenced', 'drift-fenced']) await test(`drift-foreign-write-after-${phase}-quarantines-preserving-both-sources`, async ({ page }) => {
    await withDrift(page); await prepare(page, true); await arm(page, phase, 'source-drift-after-fence');
    const result = await activate(page); assert.equal(result.status, 'quarantined'); assert.equal(result.reason, 'legacy-drift-diverged');
    assert.equal(await page.evaluate(() => window.fixture.fault.fired), true); await page.evaluate(() => window.fixture.disarm());
    const after = await disk(page); assert.equal(JSON.parse(after.driftText).known.foreign, true); assert.equal(JSON.parse(after.text).v, 2);
    assert.equal((await page.evaluate(() => window.fixture.instance.localCustody())).source.legacyDriftText, originalDriftText);
  });
  for (const phase of ['fenced', 'drift-fenced']) await test(`drift-owner-loss-after-${phase}-requires-new-owner-before-recovery`, async ({ page, context }) => {
    await withDrift(page); await prepare(page, true); await arm(page, phase, 'writer-lost');
    assert.equal((await activate(page)).status, 'recovery-required'); assert.equal(await page.evaluate(() => window.fixture.fault.fired), true);
    await page.evaluate(() => window.fixture.disarm());
    const next = await fixturePage(context); await own(next); await open(next, true);
    const result = await next.evaluate(() => window.fixture.instance.resume());
    assert.equal(result.status, 'recovery-required'); assert.equal(result.reason, phase === 'fenced' ? 'partial-fences' : 'fence-awaits-activation');
    assert.equal((await activate(next)).status, 'active');
  });
  await test('drift-only-fence-with-durable-intent-is-recoverable', async ({ page }) => {
    await withDrift(page); await prepare(page, true); await arm(page, 'fenced', 'quota'); await activate(page);
    await page.evaluate(() => window.fixture.disarm()); const manifest = await savedManifest(page);
    assert.equal(manifest.phase, 'intent');
    await page.evaluate((text) => localStorage.setItem('bunki-drift-v1', text), manifest.driftFenceText);
    const result = await page.evaluate(() => window.fixture.instance.resume());
    assert.equal(result.status, 'recovery-required'); assert.equal(result.reason, 'partial-fences');
    assert.equal((await activate(page)).status, 'active'); assert.equal((await disk(page)).text, manifest.fenceText);
  });
  await test('drift-only-fence-without-durable-intent-is-quarantined', async ({ page }) => {
    await withDrift(page); await prepare(page, true); const manifest = await savedManifest(page);
    await page.evaluate((text) => localStorage.setItem('bunki-drift-v1', text), manifest.driftFenceText);
    const result = await activate(page); assert.equal(result.status, 'quarantined'); assert.equal(result.reason, 'activation-stores-disagree');
    assert.equal((await disk(page)).text, originalText);
  });
  await test('drift-active-command-keeps-state-and-observation-in-one-transaction', async ({ page }) => {
    await withDrift(page); await prepare(page, true); await activate(page);
    const before = await disk(page);
    const result = await exact(page, async () => {
      const f = window.fixture; const before = (await f.instance.snapshot()).snapshot;
      const record = structuredClone(before.documents.find((row) => row.collection === 'learner-record').value);
      record.driftState.store.known['学校'] = 1700000001111; record.driftState.store.lk += 1;
      record.obslog.push({ type: 'swipe', wordId: '学校', known: true, ts: 1700000001111 });
      const request = { changeId: 'drift-judgment-a', binding: f.policy.binding, expectedRevision: before.revision, occurredAt: '2026-09-10T00:00:00.000Z',
        mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: record }], operations: [] };
      return { request, result: await f.instance.commitLocal(request), current: await f.instance.snapshot() };
    });
    assert.equal(result.result.status, 'active'); const learner = result.current.snapshot.documents.find((row) => row.collection === 'learner-record').value;
    assert.equal(learner.driftState.store.lk, 42); assert.equal(learner.driftState.store.known['学校'], 1700000001111);
    assert.equal(learner.obslog.length, 1); assert.equal(learner.aiChat.length, 40); assert.equal(learner.aiReadings.length, 20);
    assert.equal(Object.hasOwn(learner.driftState.store, '__proto__'), true); assert.equal(Object.hasOwn(learner, '__proto__'), true);
    assert.deepEqual(result.current.snapshot.outbox, []); assert.equal(result.current.snapshot.actor.sequence, 0);
    const duplicate = await exact(page, (request) => window.fixture.instance.commitLocal(request), result.request);
    assert.equal(duplicate.receipt.outcome, 'duplicate');
    for (const mode of ['delete', 'missing', 'invalid']) await assert.rejects(page.evaluate(async (mode) => {
      const f = window.fixture; const current = (await f.instance.snapshot()).snapshot;
      const record = structuredClone(current.documents.find((row) => row.collection === 'learner-record').value);
      if (mode === 'missing') delete record.driftState; else record.driftState.version = 99;
      return f.instance.commitLocal({ changeId: `bad-drift-${mode}`, binding: f.policy.binding, expectedRevision: current.revision, occurredAt: '2026-09-10T00:00:00.000Z', operations: [],
        mutations: [mode === 'delete' ? { kind: 'delete', collection: 'learner-record', id: 'current' } : { kind: 'put', collection: 'learner-record', id: 'current', value: record }] });
    }, mode), /drift-state-required|drift-state-unavailable|unsupported-drift-state/u);
    assert.deepEqual(await exact(page, () => window.fixture.instance.snapshot()), result.current);
    const after = await disk(page); assert.equal(after.text, before.text); assert.equal(after.driftText, before.driftText); assert.deepEqual(after.rows, before.rows);
    assert.equal((await page.evaluate(() => window.fixture.instance.localCustody())).source.legacyDriftText, originalDriftText);
  });
  for (const mode of ['quota', 'abort', 'source-drift-after-commit']) await test(`drift-active-${mode}-reports-exact-transaction-outcome`, async ({ page }) => {
    await withDrift(page); await prepare(page, true); await activate(page);
    const before = await exact(page, () => window.fixture.instance.snapshot());
    const legacy = await disk(page); await arm(page, 'drift-delegated', mode);
    const command = page.evaluate(async () => {
      const f = window.fixture; const current = (await f.instance.snapshot()).snapshot;
      const record = structuredClone(current.documents.find((row) => row.collection === 'learner-record').value);
      record.driftState.store.known['学校'] = 1700000001111; record.driftState.store.lk += 1;
      record.obslog.push({ type: 'swipe', wordId: '学校', known: true, ts: 1700000001111 });
      return f.instance.commitLocal({ changeId: 'drift-boundary-write', binding: f.policy.binding, expectedRevision: current.revision, occurredAt: '2026-09-10T00:00:00.000Z',
        mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: record }], operations: [] });
    });
    if (mode === 'source-drift-after-commit') {
      const result = await command;
      assert.equal(result.status, 'quarantined'); assert.equal(result.reason, 'legacy-drift-diverged');
      assert.equal(result.targetCommitDurable, true); assert.equal(result.targetReceipt.outcome, 'committed');
      const after = await disk(page); assert.equal(JSON.parse(after.driftText).known['late-legacy-writer'], true);
      const target = JSON.parse(after.target.find((row) => row.kind === 'document' && JSON.parse(row.text).collection === 'learner-record').text).value;
      assert.equal(target.obslog.length, 1); assert.equal(target.driftState.store.lk, 42); assert.equal(target.driftState.store.known['学校'], 1700000001111);
    } else {
      await assert.rejects(command, mode === 'quota' ? /QuotaExceededError/u : /AbortError|reopen-required/u);
      await page.evaluate(() => window.fixture.disarm());
      assert.deepEqual(await exact(page, () => window.fixture.instance.snapshot()), before);
      assert.deepEqual(await disk(page), legacy);
    }
    assert.equal(await page.evaluate(() => window.fixture.fault.fired), true);
    assert.equal((await page.evaluate(() => window.fixture.instance.localCustody())).source.legacyDriftText, originalDriftText);
  });
  if (ENGINE === 'chromium') for (const phase of ['prepared', 'intent', 'fenced', 'drift-fenced', 'active']) await test(`drift-renderer-crash-after-${phase}-resumes-exact-custody`, async ({ page, context }) => {
    await withDrift(page); if (phase !== 'prepared') await prepare(page, true);
    await arm(page, phase, 'crash'); const session = await context.newCDPSession(page); await session.send('Debugger.enable');
    const paused = new Promise((done) => session.once('Debugger.paused', done));
    const flight = phase === 'prepared' ? prepare(page, true) : activate(page); flight.catch(() => undefined);
    let timer;
    try { await Promise.race([paused, new Promise((_, fail) => { timer = setTimeout(() => fail(new Error('Drift migration boundary was not reached')), 12000); })]); }
    finally { clearTimeout(timer); }
    const { targetInfo } = await session.send('Target.getTargetInfo');
    const crashed = new Promise((done) => page.once('crash', done)); void session.send('Page.crash').catch(() => undefined); await crashed;
    const browserSession = await browser.newBrowserCDPSession();
    assert.equal((await browserSession.send('Target.closeTarget', { targetId: targetInfo.targetId })).success, true); await browserSession.detach();
    const next = await fixturePage(context); await own(next); await open(next, true);
    const result = await next.evaluate(() => window.fixture.instance.resume());
    assert.equal(result.status, phase === 'active' ? 'active' : ['fenced', 'drift-fenced'].includes(phase) ? 'recovery-required' : 'prepared');
    const custody = await next.evaluate(() => window.fixture.instance.localCustody()); assert.equal(custody.source.legacyDriftText, originalDriftText);
    assert.equal(custody.source.recordText, originalText); assert.deepEqual(custody.source.archive.rows, archiveRows);
    assert.equal((await activate(next)).status, 'active');
    const before = await disk(next);
    for (let count = 0; count < 3; count++) assert.equal((await activate(next)).status, 'active');
    assert.deepEqual(await disk(next), before);
    const current = await next.evaluate(() => window.fixture.instance.snapshot()); assert.equal(current.snapshot.actor.sequence, 0); assert.deepEqual(current.snapshot.outbox, []);
  });
  if (ENGINE === 'chromium') for (const phase of ['prepared', 'intent', 'fenced', 'active']) await test(`renderer-crash-after-${phase}-recovers-without-dualwrite`, async ({ page, context }) => {
    if (phase !== 'prepared') await prepare(page);
    await arm(page, phase, 'crash');
    const session = await context.newCDPSession(page); await session.send('Debugger.enable');
    const paused = new Promise((done) => session.once('Debugger.paused', done));
    const flight = phase === 'prepared' ? prepare(page) : activate(page); flight.catch(() => undefined);
    let timer;
    try { await Promise.race([paused, new Promise((_, fail) => { timer = setTimeout(() => fail(new Error('Migration boundary was not reached')), 12000); })]); }
    finally { clearTimeout(timer); }
    const { targetInfo } = await session.send('Target.getTargetInfo');
    const crashed = new Promise((done) => page.once('crash', done));
    void session.send('Page.crash').catch(() => undefined);
    await crashed;
    const browserSession = await browser.newBrowserCDPSession();
    assert.equal((await browserSession.send('Target.closeTarget', { targetId: targetInfo.targetId })).success, true); await browserSession.detach();
    const recovered = await fixturePage(context); await own(recovered); await open(recovered);
    const status = await recovered.evaluate(() => window.fixture.instance.resume());
    assert.equal(status.status, phase === 'active' ? 'active' : phase === 'fenced' ? 'recovery-required' : 'prepared');
    const before = await disk(recovered); assert.equal(JSON.parse(before.text).v, ['fenced', 'active'].includes(phase) ? 2 : 1); assert.deepEqual(before.rows, archiveRows);
    assert.equal((await recovered.evaluate(() => window.fixture.instance.localCustody())).source.recordText, originalText);
    assert.equal((await activate(recovered)).status, 'active');
    const after = await recovered.evaluate(() => window.fixture.instance.snapshot()); assert.equal(after.snapshot.outbox.length, 0); assert.equal(after.snapshot.actor.sequence, 0);
  });
} finally {
  await browser.close();
  mkdirSync(engineOut, { recursive: true });
  writeFileSync(resolve(engineOut, 'record-controller-results.json'), JSON.stringify({ engine: ENGINE, browserVersion,
    site: SITE, legacyDriftLoaderSha256: createHash('sha256').update(LEGACY_DRIFT_LOADER).digest('hex'),
    legacyApp: { revision: LEGACY_REVISION, files: Object.fromEntries(Object.entries(LEGACY_APP).map(([file, bytes]) => [file, createHash('sha256').update(bytes).digest('hex')])) },
    controllerSha256: createHash('sha256').update(CONTROLLER).digest('hex'), coreSha256: createHash('sha256').update(CORE).digest('hex'),
    results, errors, externalRequests: network }, null, 2));
}
assert(results.length > 0, 'No record controller scenarios executed');
assert.equal(errors.length, 0, 'Unexpected page errors');
assert.equal(network.length, 0, 'Migration must not send network requests');
assert(results.every((result) => result.status === 'passed'), 'Record controller scenario failed');

}
const failedEngines = [];
try {
  for (const engine of SELECTION === 'all' ? ['chromium', 'webkit'] : [SELECTION]) {
    try { await runEngine(engine); } catch (error) { failedEngines.push({ engine, message: error.message }); }
  }
} finally { await new Promise((done) => server.close(done)); }
assert.deepEqual(failedEngines, [], 'Record controller browser verification failed');
