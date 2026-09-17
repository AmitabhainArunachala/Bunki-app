'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, systemPreferences } = require('electron');
const console = require('node:console');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout, clearTimeout } = require('node:timers');
const { pathToFileURL, URL } = require('node:url');
const { startStaticHost } = require('./lib/static-host.cjs');
const { verifyBundledArtifact } = require('./lib/artifact.cjs');
const { runtimeOptions } = require('./lib/paths.cjs');
const { isAppURL, publisherURL, mayRequestMicrophone } = require('./lib/navigation-policy.cjs');
const { createFeedService } = require('./lib/feed-service.cjs');
const { installFeedIPC } = require('./lib/feed-ipc.cjs');
const { createPublisherReader } = require('./lib/publisher-reader.cjs');
const { readNativeCloudConfiguration } = require('./lib/native-cloud-sync.cjs');
const { createNativeFileSaver } = require('./lib/native-files.cjs');
const { createNativeIntake } = require('./lib/native-intake.cjs');

let options;
try {
  options = runtimeOptions({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, appDirectory: __dirname });
  if (options.profile) {
    fs.mkdirSync(options.profile, { recursive: true });
    app.setPath('userData', options.profile);
  }
  if (options.evidence) fs.mkdirSync(options.evidence, { recursive: true });
} catch (error) {
  console.error(`Bunki could not start: ${error.message}`);
  app.exit(1);
}

let mainWindow = null;
let host = null;
let watcher = null;
let quitting = false;
let trustedAt = -Infinity;
let microphoneGranted = false;
let identity = null;
let feeds = null;
let publisherReader = null;
let nativeSessionOwner = null;
let recordSyncHost = null;
let nativeCloudConfiguration = null;
let nativeCloudConfigurationCode = 'setup-required';
const canChooseFile = () => !options.testing && mainWindow?.isFocused() && Date.now() >= trustedAt && Date.now() - trustedAt <= 30000;
const captureFileDocument = () => {
    const window = mainWindow;
    const contents = window?.webContents;
    const frame = contents?.mainFrame;
    const token = frame?.frameToken;
    // Consume the trusted input once; backup preparation can take time before
    // opening the native dialog, but it cannot silently initiate another save.
    trustedAt = -Infinity;
    return { window, assertCurrent: () => mainWindow === window && window && !window.isDestroyed()
      && !contents.isDestroyed() && !contents.isLoadingMainFrame() && contents.mainFrame === frame
      && !frame.detached && frame.frameToken === token && frame.origin === host.origin
      && isAppURL(frame.url, host.origin) && isAppURL(contents.getURL(), host.origin) };
};
const saveNativeFile = createNativeFileSaver({ dialog, canSave: canChooseFile, captureDocument: captureFileDocument });
const nativeIntake = createNativeIntake({ dialog, canChoose: canChooseFile, captureDocument: captureFileDocument,
  contracts: () => require('./lib/native-rpc-session.cjs'),
  executable: path.join(process.resourcesPath, 'native/kairo-text-intake-host'),
  cacheDirectory: path.join(app.getPath('cache'), 'kairo-source-copies'), openPath: filename => shell.openPath(filename) });

function audit(event, details = {}) {
  if (options?.testing) fs.appendFileSync(path.join(options.evidence, 'events.jsonl'), JSON.stringify({ event, ...details }) + '\n');
}

function fail(error) {
  const message = error.code === 'EADDRINUSE'
    ? `Port ${options.port} is already in use. Close the other process and reopen Bunki. Your records remain in this app's existing profile; no other server was opened.`
    : `The bundled app could not be opened. ${error.message}`;
  audit('startup-failed', { code: error.code || 'STARTUP_FAILED', message });
  if (!options.testing) dialog.showErrorBox('Bunki could not start', message);
  else console.error(message);
  app.exit(1);
}

function fromApp(event) {
  return mainWindow && event.sender === mainWindow.webContents
    && !mainWindow.webContents.isLoadingMainFrame()
    && event.senderFrame === mainWindow.webContents.mainFrame
    && isAppURL(event.senderFrame.url, host.origin);
}

ipcMain.on('bunki:trusted-input', (event) => {
  if (fromApp(event)) trustedAt = Date.now();
});
ipcMain.handle('bunki:files:available', (event) => fromApp(event) && !options.testing);
ipcMain.handle('bunki:files:save', (event, ...args) => {
  if (!fromApp(event) || args.length !== 1) throw new Error('file-export-unavailable');
  return saveNativeFile(args[0]);
});
ipcMain.handle('bunki:intake:available', event => fromApp(event) && !options.testing && nativeIntake.available());
for (const method of ['choose', 'extract', 'openOriginal']) ipcMain.handle('bunki:intake:' + method, (event, ...args) => {
  if (!fromApp(event) || args.length !== 1) return { status: 'failed', code: 'file-intake-unavailable' };
  return nativeIntake[method](args[0]);
});
ipcMain.on('bunki:navigate', (event, url) => {
  if (fromApp(event) && isAppURL(url, host.origin)) void mainWindow.loadURL(url).catch(fail);
});
ipcMain.on('bunki:publisher', (event, value) => {
  if (!fromApp(event)) return;
  const url = publisherURL(value, host.origin);
  if (!url) return audit('publisher-denied');
  if (options.testing) return audit('publisher-open-simulated', { url });
  void shell.openExternal(url).catch(() => dialog.showErrorBox('Link could not open', 'Your browser could not open this publisher link.'));
});

function installPermissions(contents) {
  const session = contents.session;
  if (options.testing) {
    // The isolated QA app is offline before its first page load, including
    // service-worker requests. Publisher clicks are recorded, never opened.
    session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (request, callback) => {
      const protocol = new URL(request.url).protocol;
      const cancel = ['http:', 'https:', 'ws:', 'wss:'].includes(protocol) && !isAppURL(request.url, host.origin);
      if (cancel) audit('network-blocked', { url: request.url });
      callback({ cancel });
    });
  }
  session.setPermissionCheckHandler((requester, permission, requestingOrigin, details) => {
    return requester === mainWindow?.webContents && microphoneGranted
      && isAppURL(requestingOrigin, host.origin)
      && mayRequestMicrophone({ permission, requestingUrl: details.requestingUrl || requestingOrigin,
        isMainFrame: details.isMainFrame, mediaTypes: [details.mediaType], origin: host.origin,
        trustedAt, now: Date.now() });
  });
  session.setPermissionRequestHandler((requester, permission, callback, details) => {
    const allowed = requester === mainWindow?.webContents && mainWindow.isFocused()
      && mayRequestMicrophone({ permission, ...details, origin: host.origin, trustedAt, now: Date.now() });
    if (!allowed) {
      audit('permission-denied', { permission });
      callback(false);
      return;
    }
    // QA uses a generated fake device and never requests the real microphone.
    const window = mainWindow;
    const frame = requester.mainFrame;
    const token = frame.frameToken;
    const consent = options.testing
      ? Promise.resolve(app.commandLine.hasSwitch('use-fake-device-for-media-stream'))
      : process.platform === 'darwin' ? systemPreferences.askForMediaAccess('microphone') : Promise.resolve(true);
    void consent.then((granted) => {
      if (mainWindow !== window || window.isDestroyed() || requester.isDestroyed()
        || requester.isLoadingMainFrame() || requester.mainFrame !== frame
        || frame.detached || frame.frameToken !== token || frame.origin !== host.origin
        || !isAppURL(requester.getURL(), host.origin)) {
        callback(false);
        return;
      }
      microphoneGranted = granted;
      audit('microphone-decision', { granted });
      callback(granted);
    }).catch(() => callback(false));
  });
}

async function createWindow() {
  trustedAt = -Infinity;
  const window = new BrowserWindow({
    width: 1180, height: 860, minWidth: 390, minHeight: 600, show: false,
    backgroundColor: '#F4EFE6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true,
      nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
      webviewTag: false, webSecurity: true, allowRunningInsecureContent: false,
      devTools: !app.isPackaged || options.testing,
    },
  });
  mainWindow = window;
  // The compiled native session is staged with the host. Keep loading lazy so
  // launch has already validated the canonical site before this dependency.
  const { createNativeSessionOwner } = require('./lib/native-session-owner.cjs');
  const owner = createNativeSessionOwner({ window, app, origin: host.origin });
  nativeSessionOwner = owner;
  const { createRecordSyncHost } = require('./lib/record-sync-ipc.cjs');
  const sync = createRecordSyncHost({ window, owner, origin: host.origin,
    configuration: nativeCloudConfiguration, configurationCode: nativeCloudConfigurationCode,
    canConnect: () => !options.testing && mainWindow === window && window.isFocused()
      && Date.now() >= trustedAt && Date.now() - trustedAt <= 5000 });
  recordSyncHost = sync;
  const contents = window.webContents;
  // A gesture belongs to the document that observed it. Reloading must not
  // let replacement page code use an earlier click to open a native dialog.
  const clearDocumentTrust = () => {
    if (mainWindow !== window) return;
    trustedAt = -Infinity;
    nativeIntake.clear();
    microphoneGranted = false;
  };
  contents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) clearDocumentTrust();
  });
  contents.on('render-process-gone', clearDocumentTrust);
  contents.on('destroyed', clearDocumentTrust);
  contents.setWindowOpenHandler(() => { audit('child-window-denied'); return { action: 'deny' }; });
  for (const eventName of ['will-navigate', 'will-frame-navigate', 'will-redirect']) {
    contents.on(eventName, (event) => {
      if (!isAppURL(event.url, host.origin)) {
        event.preventDefault();
        audit('navigation-denied');
      }
    });
  }
  contents.on('will-attach-webview', (event) => event.preventDefault());
  installPermissions(contents);
  window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show(); });
  window.on('closed', () => {
    sync.close();
    if (recordSyncHost === sync) recordSyncHost = null;
    owner.close();
    if (nativeSessionOwner === owner) nativeSessionOwner = null;
    if (mainWindow === window) mainWindow = null;
  });
  await window.loadURL(host.origin + '/');
  audit('window-ready', { origin: host.origin, site: options.site, profile: app.getPath('userData'), packaged: app.isPackaged,
    artifactSha256: identity?.artifactSha256 || null, live: options.live, versions: process.versions });
}

async function exportPairingCandidate() {
  if (!mainWindow || !recordSyncHost || options.testing) return;
  const window = mainWindow;
  let capture;
  try { capture = recordSyncHost.capturePairingCandidate(); }
  catch {
    await dialog.showMessageBox(window, { type: 'info', title: 'Pair another device',
      message: 'Connect personal note sync first.',
      detail: 'Open Saved notes and connect to iCloud before creating a pairing file.' });
    return;
  }
  const result = await dialog.showSaveDialog(window, { title: 'Save a pairing file for your other device',
    defaultPath: 'kairo-pairing.json', filters: [{ name: 'Kairo pairing file', extensions: ['json'] }],
    message: 'Open this file in Kairo on your new device, then confirm the same learner with your iCloud account.' });
  if (result.canceled || !result.filePath) return;
  if (mainWindow !== window || window.isDestroyed() || !capture.assertCurrent()) {
    if (!window.isDestroyed()) await dialog.showMessageBox(window, { type: 'info',
      message: 'The sync connection changed. Connect again before saving a pairing file.' });
    return;
  }
  try { fs.writeFileSync(result.filePath, capture.bytes, { mode: 0o600 }); }
  catch { if (!window.isDestroyed()) dialog.showErrorBox('Pairing file could not be saved', 'Choose another location and try again.'); }
}

function menu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Bunki', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Navigate', submenu: [
      { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => { if (mainWindow?.webContents.navigationHistory.canGoBack()) mainWindow.webContents.navigationHistory.goBack(); } },
      { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: () => { if (mainWindow?.webContents.navigationHistory.canGoForward()) mainWindow.webContents.navigationHistory.goForward(); } },
    ] },
    { label: 'Sync', submenu: [{ label: 'Pair another device…', click: () => {
      void exportPairingCandidate().catch(() => dialog.showErrorBox('Pairing file could not be saved', 'Open Kairo and try again.'));
    } }] },
    { role: 'windowMenu' },
  ]));
}

async function launch() {
  if (app.isPackaged) identity = verifyBundledArtifact(options.site);
  else {
    if (!fs.existsSync(path.join(options.site, 'modules/reading-core.mjs'))) {
      throw new Error('Development requires a compiled canonical site. Run npm start in prototypes/bunki-desktop, or set BUNKI_SRC_DIR to a prepared artifact.');
    }
    identity = verifyBundledArtifact(options.site);
  }
  host = await startStaticHost({ site: options.site, port: options.port });
  const feedCore = await import(pathToFileURL(path.join(options.site, 'modules/feed-core.mjs')).href);
  feeds = createFeedService({ core: feedCore, profile: app.getPath('userData') });
  publisherReader = createPublisherReader({ core: feedCore, resolveEntry: feeds.resolveEntry,
    enabled: () => !options.testing });
  installFeedIPC({ ipcMain, fromApp, service: feeds, reader: publisherReader });
  // Packaged configuration is a fixed native resource. Neither renderer
  // requests nor imported records can select a helper, container or account.
  if (app.isPackaged && !options.testing) {
    try { nativeCloudConfiguration = readNativeCloudConfiguration(process.resourcesPath); }
    catch { nativeCloudConfigurationCode = 'configuration-invalid'; }
  }
  const { installRecordSyncIPC } = require('./lib/record-sync-ipc.cjs');
  installRecordSyncIPC({ ipcMain, fromApp, active: () => recordSyncHost });
  menu();
  if (options.live) {
    let timer;
    watcher = fs.watch(options.site, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => mainWindow?.webContents.reload(), 250);
    });
  }
  await createWindow();
}

// Keep the original Bunki single-instance/name sequence and default userData
// identity for packaged upgrades. Only development and explicit QA set a path.
if (options && !app.requestSingleInstanceLock()) app.quit();
else if (options) {
  app.setName('Bunki');
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
    else if (host) void createWindow().catch(fail);
  });
  app.whenReady().then(launch).catch(fail);
  app.on('activate', () => { if (!mainWindow && host) void createWindow().catch(fail); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', (event) => {
    if (quitting || !host) return;
    event.preventDefault();
    quitting = true;
    recordSyncHost?.close();
    watcher?.close();
    void Promise.allSettled([host.close(), feeds?.close(), publisherReader?.close(), nativeIntake.dispose()]).finally(() => app.quit());
  });
}
