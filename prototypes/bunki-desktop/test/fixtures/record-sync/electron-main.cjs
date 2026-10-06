'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const path = require('node:path');
const { setTimeout, clearTimeout } = require('node:timers');
const hostPath = process.env.RECORD_SYNC_FIXTURE_HOST;
const site = process.env.RECORD_SYNC_FIXTURE_SITE;
const { createNativeSessionOwner } = require(path.join(hostPath, 'lib/native-session-owner.cjs'));
const { createRecordSyncHost, installRecordSyncIPC } = require(path.join(hostPath, 'lib/record-sync-ipc.cjs'));
app.setPath('userData', process.env.RECORD_SYNC_FIXTURE_PROFILE);
app.on('window-all-closed', () => {});
let window = null; let host = null; let owner = null; let trustedAt = -Infinity;
let holdPull = false; let currentLease = null; let grants = 0; let requests = 0;
const journal = [];
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!/^(?:index\.html|renderer\.mjs|record-(?:app|host|controller|binding|sync)\.mjs|modules\/record-core\.mjs)$/u.test(name)) {
    response.writeHead(404).end(); return;
  }
  response.writeHead(200, { 'content-type': name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
  response.end(readFileSync(path.join(site, name)));
});
let origin;
function fromApp(event) {
  return !!window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url.startsWith(origin + '/');
}
ipcMain.on('bunki:trusted-input', (event) => { if (fromApp(event)) trustedAt = Date.now(); });
installRecordSyncIPC({ ipcMain, fromApp, active: () => host });
async function launch({ binding, signal }) {
  grants += 1;
  const child = spawn(process.env.RECORD_SYNC_FIXTURE_NODE, [path.join(__dirname, 'stdio-child.cjs')], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
  const revocation = new AbortController();
  const lease = { child, binding, channelId: 'synthetic-note-journal', leaseId: randomUUID(), connectionId: randomUUID(),
    revocationSignal: revocation.signal, revoke() { revocation.abort(); } };
  currentLease = lease;
  signal.addEventListener('abort', () => revocation.abort(), { once: true });
  if (signal.aborted) revocation.abort();
  child.on('error', () => {});
  child.on('message', (message) => {
    if (message.kind !== 'request') return;
    requests += 1;
    const request = message.request;
    let result;
    if (request.method === 'push') {
      for (const envelope of request.params.envelopes)
        if (!journal.some((entry) => entry.reference.opId === envelope.reference.opId)) journal.push(envelope);
      result = { accepted: request.params.envelopes.map((entry) => entry.reference), failures: [] };
    } else if (request.method === 'pull') {
      if (holdPull) return;
      const start = request.params.checkpoint === null ? 0 : Number(request.params.checkpoint.slice(7));
      const envelopes = journal.slice(start, start + request.params.limit);
      result = { previous: request.params.checkpoint, nextCheckpoint: 'cursor:' + (start + envelopes.length),
        envelopes, hasMore: start + envelopes.length < journal.length };
    } else if (request.method === 'cancel') result = { targetId: request.params.targetId, cancelled: false };
    else return;
    child.send({ kind: 'reply', value: { format: 'kairo-journal-rpc', v: 1, type: 'reply', id: request.id,
      method: request.method, leaseId: request.method === 'cancel' ? null : lease.leaseId, ok: true, result } });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Synthetic helper startup timed out')), 5000);
    child.on('message', function ready(message) {
      if (message.kind === 'ready') { clearTimeout(timer); child.off('message', ready); resolve(); }
    });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
  return lease;
}
async function open(device) {
  host?.close(); owner?.close(); window?.destroy();
  trustedAt = -Infinity; holdPull = false;
  window = new BrowserWindow({ show: true, width: 700, height: 760,
    webPreferences: { preload: path.join(hostPath, 'preload.cjs'), partition: 'persist:synthetic-record-' + device,
      sandbox: true, contextIsolation: true, nodeIntegration: false } });
  owner = createNativeSessionOwner({ window, app, origin });
  host = createRecordSyncHost({ window, owner, origin, configuration: { syntheticOnly: true },
    canConnect: () => Date.now() - trustedAt < 5000, launch, storeTimeoutMs: 10000 });
  await window.loadURL(origin + '/?device=' + device);
}
app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  globalThis.__recordSyncFixture = { open,
    state: () => ({ grants, requests, journalCount: journal.length, syntheticNativeAuthorization: true, productionPairing: false }),
    hold() { holdPull = true; }, revoke() { currentLease?.revoke(); },
    resetGesture() { trustedAt = -Infinity; },
    close() { host?.close(); owner?.close(); window?.destroy(); server.close(); },
  };
  await open('a');
});
