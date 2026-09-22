/** Focused adapter and real-browser controls checks. All identities, documents,
 * native responses and saves are synthetic; no operator profile is opened. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const source = readFileSync(resolve(repository, 'prototypes/corridor/corridor.js'), 'utf8');
const bundled = await build({ absWorkingDir: repository,
  stdin: { contents: "export * from './prototypes/corridor/record-sync.mjs'; export { createSyncOperation, operationReference, encodeLocalJson } from './scripts/corridor-record-entry.ts';", resolveDir: repository }, bundle: true, write: false,
  platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent',
  plugins: [{ name: 'actual-record-core', setup(builder) {
    builder.onResolve({ filter: /^\.\/modules\/record-core\.mjs$/ }, () => ({ path: resolve(repository, 'scripts/corridor-record-entry.ts') }));
  } }],
});
const moduleBytes = bundled.outputFiles[0].contents;
const { createRecordSyncAdapter, createSyncOperation, operationReference, encodeLocalJson } = await import('data:text/javascript;base64,' + Buffer.from(moduleBytes).toString('base64'));
const { openLocalRecordBinding, LOCAL_RECORD_BINDING_KEY } = await import(pathToFileURL(resolve(repository, 'prototypes/corridor/record-binding.mjs')));
const checks = [];
const binding = { accountId: 'synthetic-account', learnerId: 'synthetic-learner', sessionId: 'synthetic-session' };
const clone = (value) => JSON.parse(JSON.stringify(value));
const request = (method, body) => ({ requestId: 'synthetic-request', method, ...(body === undefined ? {} : { request: body }) });
function fixture() {
  const state = { owned: true, calls: [], refreshes: 0 };
  state.snapshot = { policy: { binding }, revision: 4, actor: { deviceId: 'synthetic-device', incarnationId: 'synthetic-install', sequence: 0, predecessor: null },
    documents: [{ collection: 'learner-record', id: 'current', value: { private: 'LOCAL-DOCUMENT-MUST-NOT-CROSS' } }],
    replica: { operations: [], pending: [], ready: [], projection: { entities: [] } },
    outbox: [], acknowledgedOutbox: [], inbox: [], checkpoints: [], runtimeLabel: 'browser' };
  state.receipt = { changeId: 'synthetic-change', committedRevision: 5, operations: [], outcome: 'committed', runtimeLabel: 'browser' };
  state.controller = {
    snapshot: async () => ({ status: 'active', snapshot: state.snapshot }),
    commitReceive: async (body) => { state.calls.push(body); return { status: 'active', receipt: state.receipt }; },
    acknowledgeOutbox: async (body) => { state.calls.push(body); return { status: 'active', receipt: state.receipt }; },
  };
  state.adapter = createRecordSyncAdapter({ binding, controller: state.controller, assertCurrent: () => state.owned,
    refresh: async () => { state.refreshes += 1; return state.refreshResult || { status: 'active', snapshot: {} }; } });
  return state;
}
const receive = { deliveryId: 'synthetic-delivery', expectedRevision: 4,
  delivery: { binding, operations: [] }, checkpoint: { channelId: 'synthetic-channel', expected: null, next: '1' } };
const ack = { acknowledgementId: 'synthetic-ack', expectedRevision: 4, binding, operations: [] };
async function check(name, action) { await action(); checks.push(name); }

await check('snapshot strips only transport documents', async () => {
  const f = fixture(); const before = clone(f.snapshot);
  const result = await f.adapter.handle(request('snapshot'));
  assert.equal(result.ok, true); assert.deepEqual(result.value.documents, []);
  assert.deepEqual(clone(result.value), { ...before, documents: [] }); assert.deepEqual(f.snapshot, before);
});
function operation(index, text = '猫', prior = null) {
  return createSyncOperation({ format: 'kairo-sync-operation', v: 1,
    scope: { accountId: binding.accountId, learnerId: binding.learnerId },
    actor: prior ? { ...prior.actor, sequence: prior.actor.sequence + 1 } : { deviceId: 'synthetic-device-' + index, incarnationId: 'synthetic-install', sequence: 1 },
    predecessor: prior ? operationReference(prior) : null, dependencies: [], schemaEpoch: 1, deletionEpoch: 0,
    mergePolicy: 'kairo-conservative-merge/1', occurredAt: '2026-09-10T00:00:00.000Z',
    payload: { kind: 'note.version', noteId: 'note-' + index, versionId: 'version-' + index,
      generation: null, supersedes: [], segments: Array.from({ length: Math.ceil(text.length / 60_000) }, (_, offset) =>
        ({ kind: 'original', text: text.slice(offset * 60_000, (offset + 1) * 60_000) })) } });
}
await check('native snapshot returns exact canonical bounded sorted envelopes without writes', async () => {
  const f = fixture(); const first = operation(0);
  f.snapshot.outbox = [first, ...Array.from({ length: 99 }, (_, index) => operation(index + 1)), operation(100, '次の文', first)].reverse();
  const before = clone(f.snapshot);
  const result = await f.adapter.handle(request('prepareNativeSnapshot'));
  assert.equal(result.ok, true); assert.deepEqual(result.value.snapshot.documents, []);
  const sorted = [...f.snapshot.outbox].sort((left, right) => left.actor.sequence - right.actor.sequence ||
    (left.opId < right.opId ? -1 : 1));
  assert.equal(result.value.envelopes.length, 100);
  assert.deepEqual(clone(result.value.envelopes), sorted.slice(0, 100).map((row) => ({
    reference: operationReference(row), canonicalText: encodeLocalJson(row).text })));
  assert.deepEqual(f.snapshot, before); assert.equal(f.calls.length, 0); assert.equal(f.refreshes, 0);
  assert.equal((await f.adapter.handle({ ...request('prepareNativeSnapshot'), request: {} })).error.code, 'invalid-request');
});
await check('native canonical envelope limits count UTF8 and retain the whole unacknowledged outbox', async () => {
  const f = fixture(); f.snapshot.outbox = [operation(1, '日'.repeat(90_000))];
  assert.equal((await f.adapter.handle(request('prepareNativeSnapshot'))).error.code, 'batch-too-large');
  f.snapshot.outbox = Array.from({ length: 8 }, (_, index) => operation(index, '日'.repeat(60_000)));
  const result = await f.adapter.handle(request('prepareNativeSnapshot'));
  assert.equal(result.ok, true); assert(result.value.envelopes.length > 0 && result.value.envelopes.length < 8);
  const sizes = result.value.envelopes.map((row) => Buffer.byteLength(row.canonicalText));
  assert(sizes.every((size) => size <= 256 * 1024)); assert(sizes.reduce((a, b) => a + b, 0) <= 1024 * 1024);
  assert.equal(result.value.snapshot.outbox.length, 8); assert.equal(f.snapshot.outbox.length, 8); assert.equal(f.calls.length, 0);
});
await check('native snapshot refuses wrong binding and ownership changes', async () => {
  const f = fixture(); f.snapshot.policy = { binding: { ...binding, learnerId: 'other' } };
  assert.equal((await f.adapter.handle(request('prepareNativeSnapshot'))).error.code, 'binding-mismatch');
  f.controller.snapshot = async () => { f.owned = false; return { status: 'active', snapshot: f.snapshot }; };
  assert.equal((await f.adapter.handle(request('prepareNativeSnapshot'))).error.code, 'writer-required');
});
await check('confirmed receive refreshes locally; acknowledgement does not', async () => {
  const f = fixture();
  assert.equal((await f.adapter.handle(request('commitReceive', receive))).ok, true);
  assert.equal(f.refreshes, 1); assert.deepEqual(clone(f.calls[0]), receive);
  assert.equal((await f.adapter.handle(request('acknowledgeOutbox', ack))).ok, true);
  assert.equal(f.refreshes, 1);
});
await check('uncertain durable result retains code and never leaks target receipt', async () => {
  const f = fixture(); f.controller.commitReceive = async () => ({ status: 'recovery-required', reason: 'source-verification-failed',
    targetCommitDurable: true, targetReceipt: { private: 'DO-NOT-TRANSMIT' } });
  const result = await f.adapter.handle(request('commitReceive', receive));
  assert.deepEqual(result, { ok: false, error: { code: 'source-verification-failed', targetCommitDurable: true } });
  assert.equal(f.refreshes, 0); assert(!JSON.stringify(result).includes('DO-NOT-TRANSMIT'));
});
await check('even active status cannot hide uncertain target receipt', async () => {
  const f = fixture(); f.controller.acknowledgeOutbox = async () => ({ status: 'active', receipt: f.receipt, targetReceipt: f.receipt });
  assert.equal((await f.adapter.handle(request('acknowledgeOutbox', ack))).error.targetCommitDurable, true);
});
await check('nonactive snapshots and known thrown errors stay failures', async () => {
  const f = fixture(); f.controller.snapshot = async () => ({ status: 'quarantined', reason: 'legacy-record-diverged' });
  assert.equal((await f.adapter.handle(request('snapshot'))).error.code, 'legacy-record-diverged');
  f.controller.acknowledgeOutbox = async () => { throw Object.assign(new Error('PRIVATE DIAGNOSTIC'), { code: 'stale-revision' }); };
  assert.deepEqual(await f.adapter.handle(request('acknowledgeOutbox', ack)), { ok: false, error: { code: 'stale-revision' } });
  f.controller.acknowledgeOutbox = async () => { throw new Error('PRIVATE DIAGNOSTIC'); };
  assert.deepEqual(await f.adapter.handle(request('acknowledgeOutbox', ack)), { ok: false, error: { code: 'storage-failure' } });
});
await check('wrong binding and forbidden or malformed methods never touch store', async () => {
  const f = fixture();
  for (const raw of [null, request('commitLocal', {}), { ...request('snapshot'), request: {} },
    request('acknowledgeOutbox', { ...ack, binding: { ...binding, learnerId: 'other' } }),
    request('commitReceive', { ...receive, delivery: { binding: { ...binding, sessionId: 'old' }, operations: [] } })])
    assert.equal((await f.adapter.handle(raw)).ok, false);
  assert.equal(f.calls.length, 0);
});
await check('UTF8 request budget rejects before store dispatch', async () => {
  const f = fixture(); const result = await f.adapter.handle(request('acknowledgeOutbox', { ...ack, extra: '日'.repeat(3 * 1024 * 1024) }));
  assert.equal(result.error.code, 'batch-too-large'); assert.equal(f.calls.length, 0);
});
await check('owner loss before work and after durable receive fail closed', async () => {
  const f = fixture(); f.owned = false;
  assert.equal((await f.adapter.handle(request('commitReceive', receive))).error.code, 'writer-required');
  assert.equal(f.calls.length, 0); f.owned = true;
  f.controller.commitReceive = async () => { f.owned = false; return { status: 'active', receipt: f.receipt }; };
  assert.deepEqual(await f.adapter.handle(request('commitReceive', receive)), { ok: false, error: { code: 'writer-required', targetCommitDurable: true } });
});
await check('failed publication after receive preserves durable uncertainty', async () => {
  const f = fixture(); f.refreshResult = { status: 'recovery-required', reason: 'storage-failure' };
  assert.deepEqual(await f.adapter.handle(request('commitReceive', receive)), { ok: false, error: { code: 'storage-failure', targetCommitDurable: true } });
});
await check('concurrent requests are bounded and close defeats a late snapshot', async () => {
  const f = fixture(); let finish;
  f.controller.snapshot = () => new Promise((resolve) => { finish = resolve; });
  const pending = f.adapter.handle(request('snapshot'));
  assert.equal((await f.adapter.handle(request('snapshot'))).error.code, 'busy');
  f.adapter.close(); finish({ status: 'active', snapshot: f.snapshot });
  assert.equal((await pending).error.code, 'closed');
});

const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const initialScope = { accountId: 'local-account:' + uuid(101), learnerId: 'local-learner:' + uuid(102) };
function bindingFixture() {
  const f = { text: null, writes: 0, randoms: 0, owned: true };
  f.options = { storage: { getItem(key) { assert.equal(key, LOCAL_RECORD_BINDING_KEY); return f.text; },
    setItem(key, text) { assert.equal(key, LOCAL_RECORD_BINDING_KEY); f.writes++; f.text = text; } },
    assertOwner: () => f.owned, crypto: { randomUUID: () => uuid(++f.randoms) }, allowCreate: true };
  return f;
}
await check('native scope seeds only first-install account and learner with four fresh local identities', async () => {
  const f = bindingFixture(); const result = openLocalRecordBinding({ ...f.options, initialScope });
  assert.equal(result.created, true); assert.equal(f.randoms, 4); assert.equal(f.writes, 1);
  assert.equal(result.policy.binding.accountId, initialScope.accountId); assert.equal(result.policy.binding.learnerId, initialScope.learnerId);
  assert.equal(result.policy.binding.sessionId, 'local-session:' + uuid(1));
  assert.equal(result.actor.deviceId, 'local-device:' + uuid(2)); assert.equal(result.actor.incarnationId, 'local-installation:' + uuid(3));
  assert.equal(result.databaseName, 'kairo-local-record:' + uuid(4));
  const before = f.text; const reopened = openLocalRecordBinding({ ...f.options, initialScope });
  assert.equal(reopened.created, false); assert.equal(f.text, before); assert.equal(f.randoms, 4); assert.equal(f.writes, 1);
});
await check('native scope cannot replace existing binding or bypass owner and creation guards', async () => {
  const f = bindingFixture(); openLocalRecordBinding(f.options); const before = f.text;
  assert.throws(() => openLocalRecordBinding({ ...f.options, initialScope }), { code: 'binding-scope-mismatch' });
  assert.equal(f.text, before); assert.equal(f.writes, 1); assert.equal(f.randoms, 6);
  const fresh = bindingFixture();
  assert.throws(() => openLocalRecordBinding({ ...fresh.options, initialScope, allowCreate: false }), { code: 'binding-missing' });
  fresh.owned = false; assert.throws(() => openLocalRecordBinding({ ...fresh.options, initialScope }), { code: 'owner-required' });
  assert.equal(fresh.writes, 0); assert.equal(fresh.randoms, 0);
});
await check('malformed native scope is rejected before storage or randomness', async () => {
  let read = false;
  const accessor = { learnerId: initialScope.learnerId, get accountId() { read = true; return initialScope.accountId; } };
  for (const value of [null, [], {}, { ...initialScope, sessionId: 'foreign' }, { ...initialScope, accountId: 'foreign' },
    { ...initialScope, learnerId: 'local-learner:' + uuid(101) }, accessor, { ...initialScope, [Symbol('extra')]: true }]) {
    const f = bindingFixture(); assert.throws(() => openLocalRecordBinding({ ...f.options, initialScope: value }), { code: 'invalid-initial-scope' });
    assert.equal(f.writes, 0); assert.equal(f.randoms, 0); assert.equal(f.text, null);
  }
  assert.equal(read, false);
});

function extract(name, async = false) {
  const start = source.indexOf(`${async ? 'async ' : ''}function ${name}(`);
  assert(start >= 0, name); const end = source.indexOf('\n}', start);
  assert(end > start, name); return source.slice(start, end + 2);
}
const functions = [extract('closeRecordSync'), extract('recordSyncStatus'), extract('refreshRecordSyncSnapshot', true), extract('installRecordSync', true),
  extract('runRecordSyncAction', true), extract('updateRecordSyncSurface'), extract('renderRecordSync'),
  extract('refreshRecordSyncSurface'), extract('renderPortRow')].join('\n');
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Synthetic sync controls</title><body><script>
const f = window.fixture = {owned:true,calls:[],refreshes:0,publications:0,saves:[],patches:[],downloads:0,mode:'true'};
let recordEpoch=1,recordApp={snapshot:async()=>{f.refreshes++;return {status:'active',snapshot:{}};},current:()=>({status:'active',snapshot:{}})},recordController={},recordInstallation={policy:{binding:${JSON.stringify(binding)}}},recordSyncSlot=null;
const publishRecordSnapshot=()=>{f.publications++;};
const plainRecord=v=>!!v&&typeof v==='object'&&!Array.isArray(v),tx=(_,en)=>en;
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;}
const biLabel=(tag,cls,_,en)=>el(tag,cls,en),recordWritable=(epoch=recordEpoch)=>f.owned&&epoch===recordEpoch;
const dayKey=()=> '2026-09-10',buildExportRecord=async()=>({text:'{"synthetic":true}'});
const commitStorePatch=async fn=>{f.patches.push(fn({stats:{}}));return true;};
const recordFailure=()=>{f.owned=false;closeRecordSync();};
HTMLAnchorElement.prototype.click=function(){f.downloads++;};
${functions}
window.setupSave=mode=>{f.mode=mode;f.saves=[];f.patches=[];f.downloads=0;f.owned=true;document.body.replaceChildren();
 if(mode==='browser')delete window.kairoFiles;else window.kairoFiles={save:async arg=>{f.saves.push(arg);if(mode==='throw')throw Error('PRIVATE');if(mode==='deferred')return new Promise(r=>{f.finish=r;});return mode==='true'?true:mode==='false'?false:undefined;}};
 renderPortRow(document.body);};
window.setupSync=()=>{f.calls=[];f.refreshes=0;f.publications=0;f.owned=true;recordSyncSlot={registrationId:'synthetic-registration',generation:0,pending:null,status:{state:'disconnected'},current:()=>f.owned,app:recordApp,
 native:{connect:async()=>{f.calls.push('connect');return {state:'ready'};},sync:async()=>{f.calls.push('sync');return new Promise(r=>{f.finishSync=r;});},disconnect:async()=>{f.calls.push('disconnect');return {state:'disconnected'};},unregister:async()=>{f.calls.push('unregister');}}};
 document.body.replaceChildren(renderRecordSync());};
window.showUnavailable=()=>{recordSyncSlot=null;document.body.replaceChildren(renderRecordSync());};
window.registrationRace=()=>{closeRecordSync();f.calls=[];f.owned=true;recordApp={snapshot:async()=>({status:'active',snapshot:{}})};recordController={snapshot:async()=>({status:'active',snapshot:{}}),commitReceive:async()=>{},acknowledgeOutbox:async()=>{}};
 window.kairoSync={register:async()=>new Promise(r=>{f.finishRegister=r;}),unregister:async arg=>{f.calls.push(arg);},status:async()=>({state:'disconnected'}),connect:async()=>{},sync:async()=>{},disconnect:async()=>{}};
 f.registration=installRecordSync({capture:()=>({}),assert:()=>f.owned});};
</script>`;
const server = createServer((req, res) => {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-type', req.url === '/record-sync.mjs' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/record-sync.mjs' ? moduleBytes : html);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await check('native save commits timestamp only after strict true', async () => {
    for (const mode of ['true', 'false', 'undefined', 'throw', 'browser']) {
      await page.evaluate((mode) => window.setupSave(mode), mode);
      await page.locator('#export-store').click();
      await page.waitForFunction(() => !document.getElementById('export-store').disabled);
      const result = await page.evaluate(() => ({ saves: fixture.saves, patches: fixture.patches, downloads: fixture.downloads }));
      assert.equal(result.patches.length, ['true', 'browser'].includes(mode) ? 1 : 0, mode);
      assert.equal(result.downloads, mode === 'browser' ? 1 : 0, mode);
      if (mode !== 'browser') assert.deepEqual(result.saves, [{ filename: 'kairo-2026-09-10.json', mimeType: 'application/json', text: '{"synthetic":true}' }]);
    }
  });
  await check('save waits for confirmation and old owner cannot update timestamp', async () => {
    await page.evaluate(() => window.setupSave('deferred')); await page.locator('#export-store').click();
    assert.equal(await page.evaluate(() => fixture.patches.length), 0);
    await page.evaluate(() => { recordEpoch++; fixture.finish(true); });
    await page.waitForFunction(() => !document.getElementById('export-store').disabled);
    assert.equal(await page.evaluate(() => fixture.patches.length), 0);
  });
  await check('absent native host is plain and has no enabled sync action', async () => {
    await page.evaluate(() => window.showUnavailable());
    assert.match(await page.locator('.record-sync-status').innerText(), /unavailable in this host/u);
    assert.equal(await page.locator('#record-sync button:enabled').count(), 0);
  });
  await check('connect and sync require separate user actions; disconnect wins a late cycle', async () => {
    await page.evaluate(() => window.setupSync());
    assert.deepEqual(await page.evaluate(() => fixture.calls), []);
    await page.locator('#record-sync-connect').click();
    await page.waitForFunction(() => !document.getElementById('record-sync-now').disabled);
    assert.deepEqual(await page.evaluate(() => fixture.calls), ['connect']);
    await page.locator('#record-sync-now').click();
    await page.locator('#record-sync-disconnect').click();
    await page.waitForFunction(() => !document.getElementById('record-sync-connect').disabled);
    await page.evaluate(() => fixture.finishSync({state:'ready',result:{pendingOutbox:0,pendingCausal:0,hasMore:false}}));
    assert.equal(await page.evaluate(() => recordSyncSlot.status.state), 'disconnected');
    assert.equal(await page.evaluate(() => fixture.refreshes), 0);
  });
  await check('completed cycle refreshes record and reports remaining work honestly', async () => {
    await page.evaluate(() => window.setupSync()); await page.locator('#record-sync-connect').click();
    await page.waitForFunction(() => !document.getElementById('record-sync-now').disabled);
    await page.locator('#record-sync-now').click();
    await page.evaluate(() => fixture.finishSync({state:'ready',result:{pendingOutbox:1,pendingCausal:0,hasMore:true}}));
    await page.waitForFunction(() => fixture.refreshes===1);
    await page.waitForFunction(() => fixture.publications===1);
    assert.match(await page.locator('.record-sync-status').innerText(), /More changes remain/u);
  });
  await check('older connect completion cannot overwrite a replacement connection on the same registration', async () => {
    await page.evaluate(() => { window.setupSync(); recordSyncSlot.native.connect=()=>new Promise(resolve=>{fixture.finishConnect=resolve;}); });
    await page.locator('#record-sync-connect').click();
    await page.waitForFunction(() => typeof fixture.finishConnect==='function');
    await page.evaluate(() => { fixture.finishOldConnect=fixture.finishConnect; });
    await page.locator('#record-sync-disconnect').click();
    await page.waitForFunction(() => !document.getElementById('record-sync-connect').disabled);
    await page.locator('#record-sync-connect').click();
    await page.evaluate(() => { fixture.finishConnect({state:'ready'}); });
    await page.waitForFunction(() => recordSyncSlot.status.state==='ready');
    await page.evaluate(() => { fixture.finishOldConnect({state:'error',code:'session-revoked'}); });
    assert.equal(await page.evaluate(() => recordSyncSlot.status.state), 'ready');
  });
  await check('late registration is unregistered after local lifecycle closes', async () => {
    await page.evaluate(() => window.registrationRace());
    await page.waitForFunction(() => typeof fixture.finishRegister==='function');
    await page.evaluate(async () => { closeRecordSync(); fixture.finishRegister({registrationId:'late-registration'}); await fixture.registration; });
    assert.deepEqual(await page.evaluate(() => fixture.calls), [{registrationId:'late-registration'}]);
  });
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
console.log(JSON.stringify({ pass: true, count: checks.length, checks, scope: 'Synthetic adapter and Chromium DOM behavior; no authenticated native transport exercised.' }, null, 2));
