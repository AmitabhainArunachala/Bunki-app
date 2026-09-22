'use strict';
/* global AbortController */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { Buffer } = require('node:buffer');
const { pathToFileURL } = require('node:url');
const { createNativeIntake, readChosenFile, launchNativeText } = require('../lib/native-intake.cjs');
const base = path.join(os.homedir(), '.dharma/bunki/native-intake-tests');
const core = (async () => {
  await fs.mkdir(base, { recursive: true }); const directory = await fs.mkdtemp(path.join(base, 'core-'));
  const { buildReadingModule } = await import('../../../scripts/build-reading-module.mjs');
  const file = path.join(directory, 'core.mjs'); await fs.writeFile(file, buildReadingModule(path.resolve(__dirname, '../../..')).bytes, { flag: 'wx' });
  return import(pathToFileURL(file));
})();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function setup(t, changes = {}) {
  const contracts = await core, directory = await fs.mkdtemp(path.join(base, 'case-'));
  const filename = path.join(directory, 'synthetic.pdf'), executable = path.join(directory, 'helper');
  const bytes = Buffer.from('%PDF-synthetic bounded adapter test; not a real PDF');
  await fs.writeFile(filename, bytes); await fs.writeFile(executable, 'fixture', { mode: 0o700 });
  const file = { name: path.basename(filename), sha256: hash(bytes), bytes: bytes.length, mimeType: 'application/pdf', kind: 'pdf', pageCount: 2 };
  let current = true, trusted = true, picked = filename; const dialogCalls = [], requests = [], opened = [];
  const run = async ({ request }) => {
    requests.push(request);
    if (changes.run) return changes.run(request, file);
    return request.method === 'inspect' ? { status: 'inspected', file }
      : { status: 'extracted', document: { version: 1, file, pages: [{ page: request.firstPage, width: 800, height: 600, rotation: 0,
        coordinateSpace: 'normalized-top-left-unrotated-media-box', unit: 'utf16-code-unit', provider: 'apple-pdfkit-text', text: '町の図書館。', regions: [] }] } };
  };
  const service = createNativeIntake({ executable, contracts: () => contracts, canChoose: () => trusted,
    captureDocument: () => ({ window: {}, assertCurrent: () => current }), cacheDirectory: path.join(directory, 'copies'),
    dialog: { showOpenDialog: async (...args) => { dialogCalls.push(args); return changes.dialog ? changes.dialog(filename) : { canceled: false, filePaths: [picked] }; } },
    openPath: async destination => { opened.push({ destination, bytes: await fs.readFile(destination), mode: (await fs.stat(destination)).mode & 0o777 }); return changes.openError || ''; }, run,
    ...(changes.ttl ? { selectionTtlMs: changes.ttl } : {}) });
  t.after(() => service.dispose());
  return { service, file, filename, directory, executable, requests, dialogCalls, opened,
    revoke: () => { current = false; }, untrust: () => { trusted = false; }, pick: value => { picked = value; } };
}
test('chosen bytes are bounded and fingerprinted; opaque selection permits only requested pages', async t => {
  const f = await setup(t), chosen = await f.service.choose({ expected: null }); assert.equal(chosen.status, 'selected'); assert.deepEqual(chosen.file, f.file);
  assert(!JSON.stringify(chosen).includes(f.directory));
  const result = await f.service.extract({ token: chosen.token, firstPage: 2, lastPage: 2 });
  assert.equal(result.status, 'extracted'); assert.equal(result.document.pages[0].page, 2); assert.equal(result.document.pages[0].revision, null);
  assert.equal(Buffer.from(f.requests[0].dataBase64, 'base64').length, f.file.bytes);
});
test('renderer paths, untrusted calls and foreign or invalid page tokens cannot start reads', async t => {
  const f = await setup(t);
  assert.equal((await f.service.choose({ expected: null, path: f.filename })).status, 'failed'); assert.equal(f.dialogCalls.length, 0);
  const chosen = await f.service.choose({ expected: null });
  for (const input of [{ token: 'foreign', firstPage: 1, lastPage: 1 }, { token: chosen.token, firstPage: 0, lastPage: 1 },
    { token: chosen.token, firstPage: 1, lastPage: 21 }, { token: chosen.token, firstPage: 1, lastPage: 1, path: f.filename }])
    assert.equal((await f.service.extract(input)).status, 'failed');
  f.untrust(); assert.equal((await f.service.choose({ expected: null })).status, 'failed'); assert.equal(f.dialogCalls.length, 1); assert.equal(f.requests.length, 1);
});
test('cancelled native choice and mismatched bytes never replace the expected file', async t => {
  const cancelled = await setup(t, { dialog: async () => ({ canceled: true }) });
  assert.deepEqual(await cancelled.service.choose({ expected: null }), { status: 'cancelled' }); assert.equal(cancelled.requests.length, 0);
  const f = await setup(t); assert.equal((await f.service.choose({ expected: { ...f.file, sha256: 'b'.repeat(64) } })).code, 'file-mismatch');
  assert.equal((await f.service.openOriginal({ file: { ...f.file, sha256: 'b'.repeat(64) } })).code, 'file-mismatch'); assert.equal(f.opened.length, 0);
});
test('late native dialog reply loses its document ownership; concurrent choice is refused', async t => {
  const hold = deferred(), entered = deferred(); const f = await setup(t, { dialog: async () => { entered.resolve(); return hold.promise; } });
  const first = f.service.choose({ expected: null }); await entered.promise;
  assert.equal((await f.service.choose({ expected: null })).code, 'file-intake-busy');
  f.revoke(); hold.resolve({ canceled: false, filePaths: [f.filename] });
  assert.equal((await first).code, 'source-owner-changed'); assert.equal(f.requests.length, 0);
});
test('clearing an in-flight extraction prevents reuse of its result', async t => {
  const hold = deferred(), entered = deferred(); const f = await setup(t, { run: async (request, file) => {
    if (request.method === 'inspect') return { status: 'inspected', file }; entered.resolve(); return hold.promise;
  } });
  const chosen = await f.service.choose({ expected: null }), pending = f.service.extract({ token: chosen.token, firstPage: 1, lastPage: 1 });
  await entered.promise; f.service.clear(); hold.resolve({ status: 'extracted', document: {} });
  assert.equal((await pending).code, 'source-owner-changed');
});
test('native response cannot change file identity or exact page selection', async t => {
  const f = await setup(t, { run: async (_request, file) => ({ status: 'inspected', file: { ...file, bytes: file.bytes + 1 } }) });
  assert.equal((await f.service.choose({ expected: null })).code, 'extraction-response');
});
test('opening an original requires reinspection and creates only an exact read-only image/PDF snapshot', async t => {
  const f = await setup(t); assert.equal((await f.service.openOriginal({ file: { ...f.file, name: 'untrusted.command' } })).status, 'opened');
  assert.equal(f.opened.length, 1); assert.equal(path.basename(f.opened[0].destination), 'source.pdf');
  assert.equal(hash(f.opened[0].bytes), f.file.sha256); assert.equal(f.opened[0].mode, 0o400); assert.equal(f.requests[0].method, 'inspect');
  await f.service.dispose(); await assert.rejects(fs.stat(f.opened[0].destination));
});
test('regular file reads reject symlinks, empty files and oversized sparse files', async t => {
  const f = await setup(t), link = path.join(f.directory, 'link.pdf'), big = path.join(f.directory, 'big.pdf');
  await fs.symlink(f.filename, link); await assert.rejects(readChosenFile(link));
  await fs.writeFile(big, ''); await assert.rejects(readChosenFile(big));
  const fd = await fs.open(big, 'r+'); await fd.truncate(20 * 1024 * 1024 + 1); await fd.close(); await assert.rejects(readChosenFile(big));
});
test('one-shot helper transport rejects non-JSON, oversized output, timeout and launch failure', { skip: process.platform !== 'darwin' }, async t => {
  const f = await setup(t), helper = path.join(f.directory, 'protocol-fixture');
  for (const [source, code, timeoutMs] of [['#!/bin/sh\nprintf nope', 'extraction-response', 1000],
    ['#!/bin/sh\n/usr/bin/yes x', 'extraction-capacity', 1000], ['#!/bin/sh\n/bin/sleep 1', 'extraction-timeout', 30]]) {
    await fs.writeFile(helper, source, { mode: 0o700 });
    await assert.rejects(launchNativeText({ executable: helper, request: { fixture: true }, timeoutMs }), e => e.code === code);
  }
  await assert.rejects(launchNativeText({ executable: path.join(f.directory, 'absent'), request: {} }));
  await fs.writeFile(helper, '#!/bin/sh\n/bin/sleep 10', { mode: 0o700 });
  const abort = new AbortController(), running = launchNativeText({ executable: helper, request: {}, signal: abort.signal });
  abort.abort(); await assert.rejects(running, e => e.code === 'extraction-cancelled');
});
