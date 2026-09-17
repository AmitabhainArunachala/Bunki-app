'use strict';
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const console = require('node:console');
const { spawn, ChildProcess } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createServer } = require('node:http');
const path = require('node:path');
const { setTimeout, clearTimeout } = require('node:timers');
const { createNativeSessionOwner } = require(path.join(process.env.OWNER_FIXTURE_HOST, 'lib/native-session-owner.cjs'));

app.setPath('userData', process.env.OWNER_FIXTURE_PROFILE);
let allowQuit = false;
app.on('before-quit', (event) => { if (!allowQuit) event.preventDefault(); });
app.on('window-all-closed', () => {});
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
async function until(test, message, limit = 5000) {
  const end = Date.now() + limit;
  while (Date.now() < end) { if (test()) return; await delay(10); }
  assert.fail(message);
}
async function bounded(promise, message, milliseconds = 4000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
function errorOf(run) { try { run(); return null; } catch (error) { return { name: error.name, code: error.code, message: error.message }; } }
const results = [];
const server = createServer((_request, response) => { response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); response.end('<!doctype html><title>Native owner fixture</title><h1>External native owner fixture</h1>'); });
let origin;
let holder;
function windowOptions() { return { show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } }; }
async function scenario(name, action) {
  if (process.env.OWNER_FIXTURE_CASE && process.env.OWNER_FIXTURE_CASE !== name) return;
  const row = { name, pass: false, events: [], children: [] };
  results.push(row);
  const window = new BrowserWindow(windowOptions());
  const contents = window.webContents;
  const lifetimeEvents = [[contents, 'did-start-navigation'], [contents, 'render-process-gone'],
    [contents, 'destroyed'], [window, 'closed'], [app, 'before-quit']];
  const priorListeners = lifetimeEvents.map(([emitter, event]) => emitter.rawListeners(event));
  const owner = createNativeSessionOwner({ window, app, origin });
  const ownerListeners = lifetimeEvents.flatMap(([emitter, event], index) =>
    emitter.rawListeners(event).filter((fn) => !priorListeners[index].includes(fn)).map((fn) => ({ emitter, event, fn })));
  const events = (name, detail = {}) => row.events.push({ at: Date.now(), name, ...detail });
  contents.on('did-start-navigation', (details) => events('did-start-navigation', { main: details.isMainFrame, sameDocument: details.isSameDocument, url: details.url }));
  contents.on('render-process-gone', (_event, detail) => events('render-process-gone', { reason: detail.reason }));
  contents.on('destroyed', () => events('destroyed'));
  window.on('closed', () => events('window-closed'));
  const grants = [];
  async function grant(mode = 'plain') {
    const child = spawn(process.env.OWNER_FIXTURE_NODE, [path.join(__dirname, 'stdio-child.cjs'), mode], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    const controller = new globalThis.AbortController();
    const state = { child, controller, ready: false, messages: [], revokes: 0, closed: false, mode };
    grants.push(state);
    child.on('error', () => {});
    child.on('message', (message) => { if (message.kind === 'ready') state.ready = true; state.messages.push(message); });
    child.on('close', (code, signal) => { state.closed = true; state.exitCode = code; state.signal = signal; events('child-close', { pid: child.pid, code, signal }); });
    state.descriptor = { child,
      binding: { accountId: 'synthetic-owner-account', learnerId: 'synthetic-owner-learner', sessionId: 'synthetic-owner-local-session' },
      channelId: 'synthetic-owner-channel', leaseId: randomUUID(), connectionId: randomUUID(), revocationSignal: controller.signal,
      revoke() { state.revokes += 1; events('native-revoke', { pid: child.pid, count: state.revokes }); controller.abort(); } };
    await until(() => state.ready, 'Synthetic owned helper did not become ready');
    return state;
  }
  async function attached(mode) {
    const token = owner.beginDocument(); const native = await grant(mode); const session = owner.attach(token, native.descriptor);
    return { token, native, session, capture: session.capture() };
  }
  async function pending(f) {
    const request = { requestId: 'synthetic-owner-request', binding: f.capture.binding, channelId: f.capture.channelId,
      checkpoint: null, limit: 1, maxBytes: 1024 * 1024 };
    const outcome = f.session.pull(f.capture, request, new globalThis.AbortController().signal).then(
      (value) => ({ success: true, value }), (error) => ({ success: false, code: error.code, message: error.message }));
    await until(() => f.native.messages.some((message) => message.kind === 'request'), 'No actual framed request reached native stdin');
    return outcome;
  }
  try {
    assert.equal(errorOf(() => owner.beginDocument()).code, 'unavailable-document');
    await window.loadURL(origin + '/a');
    await until(() => !contents.isLoadingMainFrame(), 'Main document did not settle');
    row.initial = { contentsId: contents.id, rendererId: contents.getProcessId(), rendererPid: contents.getOSProcessId(), frameToken: contents.mainFrame.frameToken, frameOrigin: contents.mainFrame.origin, frameUrl: contents.mainFrame.url, url: contents.getURL(), loadingMain: contents.isLoadingMainFrame(), frameTopIsSelf: contents.mainFrame.top === contents.mainFrame, frameParentIsNull: contents.mainFrame.parent === null, frameDetached: contents.mainFrame.detached, frameRendererId: contents.mainFrame.processId, frameRendererPid: contents.mainFrame.osProcessId };
    await action({ row, window, contents, owner, grant, attached, pending, events });
    row.pass = true;
  } catch (error) { row.error = { message: error.message, stack: error.stack }; }
  finally {
    owner.close(); if (!window.isDestroyed()) window.destroy();
    row.ownerListenersRemoved = ownerListeners.every(({ emitter, event, fn }) => !emitter.rawListeners(event).includes(fn));
    if (!row.ownerListenersRemoved) { row.pass = false; row.teardownError = 'Owner retained an Electron lifecycle listener'; }
    for (const state of grants) {
      await until(() => state.closed, 'Owned child did not close within bounded teardown', 3500).catch((error) => { row.pass = false; row.teardownError = error.message; state.child.kill('SIGKILL'); });
      row.children.push({ pid: state.child.pid, mode: state.mode, closed: state.closed, exitCode: state.exitCode, signal: state.signal,
        revokes: state.revokes, requests: state.messages.filter((message) => message.kind === 'request').length,
        listeners: { stdoutData: state.child.stdout.listenerCount('data'), stderrData: state.child.stderr.listenerCount('data') } });
    }
    assert.equal(owner.close(), undefined);
    console.log((row.pass ? 'PASS ' : 'FAIL ') + name);
  }
}

async function run() {
  await scenario('dormant-ticket-and-valid-framed-session', async ({ owner, attached, pending }) => {
    assert(Object.isFrozen(owner));
    const f = await attached(); assert(Object.isFrozen(f.token));
    const outcome = pending(f); await until(() => f.native.messages.some((message) => message.kind === 'request'), 'No actual request'); f.native.child.send('reply');
    const result = await bounded(outcome, 'Successful native response was left pending');
    assert.equal(result.success, true); assert.equal(result.value.next, 'synthetic-cursor');
    assert.equal(f.session.assertCurrent(f.capture), true);
  });
  await scenario('unspawned-child-is-refused-without-native-adoption', async ({ owner }) => {
    const ticket = owner.beginDocument(); let revoked = 0;
    const descriptor = { child: new ChildProcess(),
      binding: { accountId: 'synthetic-owner-account', learnerId: 'synthetic-owner-learner', sessionId: 'synthetic-owner-local-session' },
      channelId: 'synthetic-owner-channel', leaseId: randomUUID(), connectionId: randomUUID(),
      revocationSignal: new globalThis.AbortController().signal, revoke() { revoked += 1; } };
    const error = errorOf(() => owner.attach(ticket, descriptor));
    assert.equal(error?.name, 'NativeSessionOwnerError'); assert.equal(error.code, 'invalid-lease');
    assert.equal(revoked, 0); assert(Object.isFrozen(owner.beginDocument()));
  });
  await scenario('already-closed-child-teardown-removes-terminal-listeners', async ({ owner, grant }) => {
    const ticket = owner.beginDocument(); const native = await grant();
    native.child.send('exit'); await until(() => native.closed, 'Helper did not close before adoption');
    const beforeClose = native.child.listenerCount('close');
    assert.equal(errorOf(() => owner.attach(ticket, native.descriptor)).code, 'invalid-lease');
    assert.equal(native.revokes, 1); assert.equal(native.child.listenerCount('close'), beforeClose);
  });
  for (const mode of ['reload', 'loadURL', 'history-back', 'crash', 'destroy', 'close', 'profile', 'logout', 'native-signal', 'eof', 'native-event']) {
    await scenario('pending-request-revoked-' + mode, async ({ owner, contents, window, attached, pending, row }) => {
      if (mode === 'history-back') {
        await window.loadURL(origin + '/history-target');
        await until(() => !contents.isLoadingMainFrame(), 'History document did not settle');
        assert(contents.navigationHistory.canGoBack());
      }
      const f = await attached();
      // Keep the rejected result handled while native lifecycle events run.
      const outcome = pending(f); await until(() => f.native.messages.some((message) => message.kind === 'request'), 'No pending frame');
      if (mode === 'reload') { const loaded = new Promise((done) => contents.once('did-finish-load', done)); contents.reload(); await loaded; }
      else if (mode === 'loadURL') await window.loadURL(origin + '/programmatic');
      else if (mode === 'history-back') { const loaded = new Promise((done) => contents.once('did-finish-load', done)); contents.navigationHistory.goBack(); await loaded; }
      else if (mode === 'crash') { const gone = new Promise((done) => contents.once('render-process-gone', done)); contents.forcefullyCrashRenderer(); await gone; }
      else if (mode === 'destroy') window.destroy();
      else if (mode === 'close') { const closed = new Promise((done) => window.once('closed', done)); window.close(); await closed; }
      else if (mode === 'profile' || mode === 'logout') owner.revoke(mode === 'profile' ? 'profile-changed' : 'logout');
      else if (mode === 'native-signal') f.native.controller.abort();
      else f.native.child.send(mode === 'eof' ? 'eof' : 'invalidate');
      const result = await bounded(outcome, 'Authority loss left a request pending');
      assert.equal(result.success, false); assert(['stale-session', 'closed', 'transport-unavailable'].includes(result.code));
      assert.equal(f.session.assertCurrent(f.capture), false);
      assert.equal(f.native.revokes, 1);
      row.result = result;
    });
  }
  await scenario('same-document-and-subframe-controls-preserve-session', async ({ contents, attached, pending, row }) => {
    const f = await attached();
    await contents.executeJavaScript("history.pushState({}, '', '#same'); const iframe = document.createElement('iframe'); iframe.src = '/subframe'; document.body.append(iframe);");
    await delay(100);
    assert.equal(f.session.assertCurrent(f.capture), true); assert.equal(f.native.revokes, 0);
    const outcome = pending(f); await until(() => f.native.messages.some((message) => message.kind === 'request'), 'No preserved session request');
    f.native.child.send('reply'); assert.equal((await bounded(outcome, 'Control request did not complete')).success, true);
    assert(row.events.some((event) => event.name === 'did-start-navigation' && event.main && event.sameDocument));
    assert(row.events.some((event) => event.name === 'did-start-navigation' && !event.main));
  });
  await scenario('late-bootstrap-cannot-kill-current-replacement', async ({ owner, window, grant, attached }) => {
    const oldTicket = owner.beginDocument(); const late = await grant('ignore-term');
    await window.loadURL(origin + '/replacement');
    await until(() => !window.webContents.isLoadingMainFrame(), 'Replacement document did not settle');
    const current = await attached();
    assert.equal(errorOf(() => owner.attach(oldTicket, late.descriptor)).code, 'stale-ticket');
    assert.equal(late.revokes, 1); assert.equal(current.native.revokes, 0);
    late.controller.abort(); await until(() => late.closed, 'Late native child escaped teardown', 3500);
    assert.equal(late.signal, 'SIGKILL'); assert.equal(current.session.assertCurrent(current.capture), true);
    assert.equal(current.native.closed, false);
  });
  await scenario('duplicate-child-and-consumed-ticket-cannot-rebind', async ({ owner, attached }) => {
    const f = await attached();
    assert.equal(errorOf(() => owner.attach(f.token, f.native.descriptor)).code, 'invalid-lease');
    assert.equal(f.session.assertCurrent(f.capture), true); assert.equal(f.native.revokes, 0);
  });
  await scenario('native-teardown-cannot-reenter-document-admission', async ({ owner, grant, pending }) => {
    const token = owner.beginDocument(); const native = await grant();
    const revoke = native.descriptor.revoke;
    const nested = [];
    native.descriptor.revoke = function () {
      nested.push(errorOf(() => owner.beginDocument()));
      nested.push(errorOf(() => owner.attach(token, native.descriptor)));
      assert.equal(native.revokes, 0);
      revoke.call(this);
    };
    const session = owner.attach(token, native.descriptor);
    const f = { native, session, capture: session.capture() };
    const outcome = pending(f); await until(() => native.messages.some((message) => message.kind === 'request'), 'No reentrancy request');
    const nextTicket = owner.beginDocument();
    assert.deepEqual(nested.map((entry) => entry?.code), ['busy', 'busy']);
    assert.equal((await bounded(outcome, 'Reentrant teardown left request pending')).success, false);
    assert.equal(native.revokes, 1); assert.equal(session.assertCurrent(f.capture), false);
    const next = await grant(); const current = owner.attach(nextTicket, next.descriptor);
    assert.equal(current.assertCurrent(current.capture()), true);
  });
  await scenario('closed-owner-disposes-late-bootstrap-result', async ({ owner, window, grant }) => {
    const ticket = owner.beginDocument(); const late = await grant();
    window.destroy();
    assert.equal(errorOf(() => owner.beginDocument()).code, 'closed');
    assert.equal(errorOf(() => owner.attach(ticket, late.descriptor)).code, 'stale-ticket');
    assert.equal(late.revokes, 1);
    await until(() => late.closed, 'Closed owner retained a late native result');
  });
  await scenario('synchronous-port-close-during-construction-tears-down-once', async ({ owner, grant }) => {
    const token = owner.beginDocument(); const native = await grant(); native.child.stdout.destroy();
    assert.equal(errorOf(() => owner.attach(token, native.descriptor)).code, 'invalid-lease');
    assert.equal(native.revokes, 1); owner.close(); assert.equal(native.revokes, 1);
  });
  await scenario('actual-app-before-quit-revokes-dormant-and-active-owner', async ({ owner, attached, pending }) => {
    const f = await attached(); const outcome = pending(f); await until(() => f.native.messages.some((message) => message.kind === 'request'), 'No pending quit request');
    app.quit();
    assert.equal(errorOf(() => owner.beginDocument()).code, 'closed');
    assert.equal((await bounded(outcome, 'Quit left request pending')).success, false);
    assert.equal(f.native.revokes, 1);
  });
  return { version: 1, suite: 'native-session-owner-actual-electron', electron: process.versions.electron,
    processId: process.pid, origin, syntheticNativeAuthorization: true, productionPairing: false,
    results, pass: results.every((row) => row.pass) };
}

app.whenReady().then(async () => {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
  holder = new BrowserWindow(windowOptions()); await holder.loadURL(origin + '/fixture');
  globalThis.__nativeOwnerFixture = { run, allowQuit: () => { allowQuit = true; }, shutdown: async () => { allowQuit = true; holder.destroy(); server.closeAllConnections(); await new Promise((done) => server.close(done)); app.quit(); } };
});
