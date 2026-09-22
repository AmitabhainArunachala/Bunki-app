'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const desktop = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(desktop, 'main.cjs'), 'utf8');
const origin = 'http://localhost:5198';
const backup = { filename: 'kairo-2026-09-11.json', mimeType: 'application/json', text: '{"synthetic":true}' };

async function fixture() {
  let now = 1000;
  let dialogCalls = 0;
  let nativeConsent = async () => true;
  const windows = [];
  const handles = new Map();
  const ipcMain = Object.assign(new EventEmitter(), { handle: (name, handler) => handles.set(name, handler) });
  class BrowserWindow extends EventEmitter {
    constructor() {
      super();
      const frame = { frameToken: `fake-document-${windows.length}`, detached: false, origin, url: origin + '/' };
      const session = {
        setPermissionCheckHandler: (handler) => { session.check = handler; },
        setPermissionRequestHandler: (handler) => { session.request = handler; },
      };
      this.webContents = Object.assign(new EventEmitter(), {
        mainFrame: frame, session, loading: false,
        isLoadingMainFrame() { return this.loading; },
        isDestroyed: () => false, getURL: () => frame.url, setWindowOpenHandler: () => {},
      });
      windows.push(this);
    }
    isFocused() { return true; }
    isDestroyed() { return false; }
    async loadURL(url) { this.webContents.mainFrame.url = url; }
  }
  const app = Object.assign(new EventEmitter(), {
    isPackaged: false, requestSingleInstanceLock: () => true, setName: () => {},
    // Never run launch(), start a server, resolve a profile, or open Electron.
    whenReady: () => new Promise(() => {}), getPath: () => '/synthetic-profile-not-opened',
  });
  const mocks = {
    electron: { app, BrowserWindow, ipcMain, Menu: {}, shell: {},
      dialog: { showSaveDialog: async () => { dialogCalls += 1; return { canceled: true }; } },
      systemPreferences: { askForMediaAccess: () => nativeConsent() } },
    './lib/paths.cjs': { runtimeOptions: () => ({ testing: false, live: false, site: '/synthetic-site-not-opened' }) },
    './lib/static-host.cjs': {}, './lib/artifact.cjs': {}, './lib/feed-service.cjs': {},
    './lib/feed-ipc.cjs': {}, './lib/publisher-reader.cjs': {}, './lib/native-cloud-sync.cjs': {},
    './lib/native-session-owner.cjs': { createNativeSessionOwner: () => ({ close() {} }) },
    './lib/record-sync-ipc.cjs': { createRecordSyncHost: () => ({ close() {} }) },
  };
  const context = vm.createContext({
    __dirname: desktop, process: { platform: 'darwin', versions: {}, resourcesPath: '/synthetic-resources-not-opened' },
    Date: class extends Date { static now() { return now; } },
    require: (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('node:')) return require(name);
      if (['./lib/navigation-policy.cjs', './lib/native-files.cjs', './lib/native-intake.cjs'].includes(name)) return require(path.join(desktop, name));
      throw new Error('Unexpected fixture dependency: ' + name);
    },
  });
  // Evaluate the entire unmodified production entrypoint. Only external
  // Electron/services are fakes; actual IPC, lifecycle and saver code runs.
  vm.runInContext(mainSource, context, { filename: path.join(desktop, 'main.cjs') });
  vm.runInContext(`host = { origin: ${JSON.stringify(origin)} };`, context);
  const open = async () => { await vm.runInContext('createWindow()', context); return windows.at(-1); };
  const window = await open();
  const event = (target) => ({ sender: target.webContents, senderFrame: target.webContents.mainFrame });
  return {
    window, open, dialogCalls: () => dialogCalls, tick: () => { now += 1; },
    input: (target = window) => ipcMain.emit('bunki:trusted-input', event(target)),
    available: (target = window) => handles.get('bunki:files:available')(event(target)),
    save: (target = window) => Promise.resolve().then(() => handles.get('bunki:files:save')(event(target), backup)),
    grantMicrophone: (target = window) => new Promise((resolve) => target.webContents.session.request(
      target.webContents, 'media', resolve, { requestingUrl: origin + '/', isMainFrame: true, mediaTypes: ['audio'] })),
    holdMicrophone: () => { let finish; const held = new Promise((resolve) => { finish = resolve; }); nativeConsent = () => held; return finish; },
    microphone: () => vm.runInContext('microphoneGranted', context),
  };
}

test('unused input cannot open a native save after main cross-document navigation', async () => {
  const f = await fixture();
  f.input();
  assert.equal(await f.grantMicrophone(), true);
  assert.equal(f.microphone(), true);
  f.window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
  assert.equal(f.microphone(), false);
  await assert.rejects(f.save(), /file-export-unavailable/);
  assert.equal(f.dialogCalls(), 0);
  f.input();
  assert.equal(await f.save(), false);
  assert.equal(f.dialogCalls(), 1);
  await assert.rejects(f.save(), /file-export-unavailable/);
});

for (const [name, details] of [
  ['same-document hash navigation', { isMainFrame: true, isSameDocument: true }],
  ['subframe cross-document navigation', { isMainFrame: false, isSameDocument: false }],
]) {
  test(`${name} preserves current-document input and microphone grant`, async () => {
    const f = await fixture();
    f.input();
    assert.equal(await f.grantMicrophone(), true);
    f.window.webContents.emit('did-start-navigation', details);
    assert.equal(f.microphone(), true);
    assert.equal(await f.save(), false);
    assert.equal(f.dialogCalls(), 1);
  });
}

test('input from a loading main frame cannot rearm trust or reach native file IPC', async () => {
  const f = await fixture();
  f.input();
  f.window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
  f.window.webContents.loading = true;
  f.tick();
  f.input();
  assert.equal(f.available(), false);
  await assert.rejects(f.save(), /file-export-unavailable/);
  f.window.webContents.loading = false;
  assert.equal(f.available(), true);
  await assert.rejects(f.save(), /file-export-unavailable/);
  assert.equal(f.dialogCalls(), 0);
  f.input();
  assert.equal(await f.save(), false);
});

for (const eventName of ['render-process-gone', 'destroyed']) {
  test(`${eventName} clears current-window document trust and microphone grant`, async () => {
    const f = await fixture();
    f.input();
    assert.equal(await f.grantMicrophone(), true);
    f.window.webContents.emit(eventName, { reason: 'synthetic-test' });
    assert.equal(f.microphone(), false);
    await assert.rejects(f.save(), /file-export-unavailable/);
    assert.equal(f.dialogCalls(), 0);
  });
}

test('old-window lifecycle events cannot clear replacement-window input or microphone grant', async () => {
  const f = await fixture();
  const replacement = await f.open();
  for (const [name, details] of [
    ['did-start-navigation', { isMainFrame: true, isSameDocument: false }],
    ['render-process-gone', { reason: 'synthetic-test' }],
    ['destroyed', {}],
  ]) {
    f.input(replacement);
    assert.equal(await f.grantMicrophone(replacement), true);
    f.window.webContents.emit(name, details);
    assert.equal(f.microphone(), true, name);
    assert.equal(await f.save(replacement), false, name);
  }
  assert.equal(f.dialogCalls(), 3);
  // Nor can an old frame supply a fresh gesture to the replacement owner.
  f.input(f.window);
  await assert.rejects(f.save(replacement), /file-export-unavailable/);
  assert.equal(f.dialogCalls(), 3);
});

for (const boundary of ['navigation', 'replacement window']) {
  test(`pending microphone result cannot restore trust after ${boundary}`, async () => {
    const f = await fixture();
    const resolveConsent = f.holdMicrophone();
    f.input();
    const result = f.grantMicrophone();
    if (boundary === 'navigation') {
      f.window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
      f.window.webContents.mainFrame.frameToken = 'replacement-document';
    } else { await f.open(); }
    assert.equal(f.microphone(), false);
    resolveConsent(true);
    assert.equal(await result, false);
    assert.equal(f.microphone(), false);
  });
}
