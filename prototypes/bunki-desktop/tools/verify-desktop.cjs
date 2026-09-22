#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { externalPath } = require('../lib/paths.cjs');
const { verifyBundledArtifact } = require('../lib/artifact.cjs');

let evidence;
let application;
let conflictServer;
let conflictChild;
const checks = [];
const pageErrors = [];
let identity;
let appPath;
let recordSupport;
let fixtureSupport;
let nativeDownloads;
const processes = [];

async function check(name, action) {
  try {
    const detail = await action();
    checks.push({ name, status: 'passed', detail: detail ?? null });
    console.log('PASS ' + name);
    return detail;
  } catch (error) {
    checks.push({ name, status: 'failed', error: error.message });
    console.error('FAIL ' + name + ': ' + error.message);
    throw error;
  }
}

function request(origin, route, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(origin + route, { headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => req.destroy(new Error('HTTP request timed out')));
  });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  assert.notEqual(port, 5198);
  return port;
}

function events(directory) {
  const file = path.join(directory, 'events.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
}

async function boot(bundle, profile, directory, port) {
  fs.mkdirSync(directory, { recursive: true });
  const { _electron } = require('playwright-core');
  application = await _electron.launch({
    executablePath: path.join(bundle, 'Contents/MacOS/Bunki'),
    args: ['--use-fake-device-for-media-stream'],
    cwd: directory,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LANG: 'en_US.UTF-8',
      TMPDIR: process.env.TMPDIR,
      ELECTRON_RUN_AS_NODE: '1',
      BUNKI_TEST_MODE: '1',
      BUNKI_TEST_PROFILE: profile,
      BUNKI_TEST_EVIDENCE: directory,
      BUNKI_TEST_PORT: String(port),
      BUNKI_SRC_DIR: path.join(directory, 'deliberately-absent-checkout'),
      BUNKI_PORT: '5198',
      BUNKI_LIVE: '1',
    },
    timeout: 60_000,
    tracesDir: directory,
  });
  application.process().stdout.on('data', (bytes) => fs.appendFileSync(path.join(directory, 'electron.log'), bytes));
  application.process().stderr.on('data', (bytes) => fs.appendFileSync(path.join(directory, 'electron.log'), bytes));
  const page = await application.firstWindow({ timeout: 45_000 });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.setDefaultTimeout(12_000);
  await page.waitForFunction(() => document.body?.dataset.ready === '1', null, { timeout: 45_000 });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus());
  const actual = await application.evaluate(({ app }) => ({ pid: process.pid, executable: process.execPath,
    application: app.getAppPath(), profile: app.getPath('userData'), packaged: app.isPackaged,
    electron: process.versions.electron, runAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null }));
  assert.equal(actual.pid, application.process().pid);
  assert.equal(fs.realpathSync(actual.executable), fs.realpathSync(path.join(bundle, 'Contents/MacOS/Bunki-bin')));
  assert.equal(actual.application, path.join(bundle, 'Contents/Resources/app.asar'));
  assert.equal(actual.profile, profile); assert.equal(actual.packaged, true); assert.equal(actual.runAsNode, null);
  const proof = { ...actual, executableSha256: createHash('sha256').update(fs.readFileSync(actual.executable)).digest('hex'),
    hostAsarSha256: createHash('sha256').update(fs.readFileSync(actual.application)).digest('hex') };
  processes.push(proof);
  fs.writeFileSync(path.join(directory, 'process-identity.json'), JSON.stringify(proof, null, 2) + '\n');
  // Bound native downloads before exercising the real export control. This
  // public DownloadItem hook only selects an isolated QA destination.
  const downloads = path.join(directory, 'downloads'); fs.mkdirSync(downloads);
  nativeDownloads = await application.evaluateHandle(({ BrowserWindow }, downloads) => {
    let serial = 0;
    const completed = [];
    BrowserWindow.getAllWindows()[0].webContents.session.on('will-download', (_event, item) => {
      item.setSavePath(downloads + '/export-' + (++serial) + '.json');
      const entry = { path: item.getSavePath(), filename: item.getFilename(), state: 'started' };
      completed.push(entry);
      item.once('done', (_event, state) => {
        entry.state = state;
        entry.receivedBytes = item.getReceivedBytes();
        entry.totalBytes = item.getTotalBytes();
      });
    });
    return completed;
  }, downloads);
  return page;
}

async function focusNativeWindow(electronApp) {
  return electronApp.evaluate(({ app, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const state = () => window && !window.isDestroyed() ? {
      visible: window.isVisible(), minimized: window.isMinimized(),
      focusable: window.isFocusable(), focused: window.isFocused(),
    } : null;
    const ready = (value) => value && value.visible && !value.minimized && value.focusable;
    if (!ready(state())) throw new Error('Native window must already be visible, non-minimized and focusable.');
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        window.off('focus', observe);
        window.off('closed', closed);
        if (error) reject(error);
        else resolve(value);
      };
      const observe = () => {
        const value = state();
        if (ready(value) && value.focused) finish(null, value);
      };
      const closed = () => finish(new Error('Native window closed before acquiring focus.'));
      window.on('focus', observe);
      window.once('closed', closed);
      timer = globalThis.setTimeout(() => finish(new Error('Native window did not acquire actual focus within 3000 ms.')), 3000);
      try {
        app.focus({ steal: true });
        window.focus();
        observe();
      } catch (error) { finish(error); }
    });
  });
}

async function nativeDownload(index) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const entry = await nativeDownloads.evaluate((items, index) => items[index], index);
    if (entry && entry.state !== 'started') {
      assert.equal(entry.state, 'completed', 'Native DownloadItem did not complete');
      assert.equal(entry.receivedBytes, entry.totalBytes);
      assert.equal(fs.statSync(entry.path).size, entry.receivedBytes);
      return entry;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Native DownloadItem did not complete within 12 seconds');
}

async function nativeRecord(page, name) {
  const snapshot = await recordSupport.readAppRecordSnapshot(page);
  for (const row of snapshot.rows) assert.equal(createHash('sha256').update(row.text).digest('hex'), row.sha256, 'Native row checksum differs');
  if (name) fs.writeFileSync(path.join(evidence, name + '.json'), JSON.stringify(snapshot, null, 2) + '\n');
  return snapshot;
}

async function nativeReplica(page) {
  return JSON.parse(await page.evaluate(async () => {
    const core = await import('./modules/record-core.mjs');
    const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
    const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, policy, actor: installation.actor });
    try { return JSON.stringify(await store.snapshot()); } finally { await store.close(); }
  }));
}

async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
}

async function openArticle(page, origin) {
  await page.goto(origin + '/?entry=shelf');
  await ready(page);
  await page.locator('.shelf-item').filter({ has: page.locator('.shelf-title', { hasText: /^静かな朝$/ }) }).click();
  await page.waitForSelector('#reader .tok.content');
  await page.waitForFunction(() => document.querySelectorAll('#reader .tok').length > 40);
}

async function fixtureLink(page, value, target = '') {
  const point = await page.evaluate(({ value, target }) => {
    document.querySelector('#host-test-link')?.remove();
    const a = document.createElement('a');
    a.id = 'host-test-link';
    a.textContent = 'Host link test';
    a.href = value;
    a.target = target;
    a.style.cssText = 'position:fixed;left:20px;top:80px;z-index:2147483647;background:white;color:black;padding:16px';
    document.body.append(a);
    const box = a.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, { value, target });
  // Electron cancels unsafe navigation in its native event handler. Use a
  // real mouse click without Playwright waiting for that cancelled document.
  await page.mouse.click(point.x, point.y);
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--app' || args[2] !== '--evidence') {
    throw new Error('Usage: node tools/verify-desktop.cjs --app /absolute/QA/Bunki.app --evidence /absolute/fresh/evidence');
  }
  appPath = externalPath(args[1]);
  const output = externalPath(args[3], { fresh: true });
  if (process.platform !== 'darwin') throw new Error('The actual Mac desktop journey requires macOS.');
  fs.mkdirSync(output, { recursive: true });
  evidence = output;
  recordSupport = await import(pathToFileURL(path.resolve(__dirname, '../../corridor/tools/record-test-support.mjs')).href);
  fixtureSupport = await import(pathToFileURL(path.resolve(__dirname, '../../corridor/tools/record-fixture-support.mjs')).href);
  // Playwright uses os.tmpdir during module initialization. All its temporary
  // profiles/downloads must remain inside this explicit isolated test run.
  process.env.TMPDIR = path.join(evidence, 'temporary');
  fs.mkdirSync(process.env.TMPDIR);
  const site = path.join(appPath, 'Contents/Resources/site/corridor');
  identity = await check('portable manifest and ad-hoc signature', () => {
    const manifest = verifyBundledArtifact(site);
    if (process.env.KAIRO_ARTIFACT_SHA256 !== undefined) assert.equal(manifest.artifactSha256, process.env.KAIRO_ARTIFACT_SHA256, 'Bundle differs from explicitly selected immutable artifact');
    const signature = spawnSync('codesign', ['--verify', '--deep', '--strict', appPath], { encoding: 'utf8' });
    assert.equal(signature.status, 0, signature.stderr);
    const digest = (relative) => createHash('sha256').update(fs.readFileSync(path.join(appPath, relative))).digest('hex');
    return { artifactSha256: manifest.artifactSha256, sourceAssetSha256: manifest.sourceAssetSha256, gitSha: manifest.gitSha,
      hostAsarSha256: digest('Contents/Resources/app.asar'), launcherSha256: digest('Contents/MacOS/Bunki'),
      sourceDirty: manifest.sourceDirty, files: manifest.files.length };
  });
  const profile = path.join(evidence, 'profile');
  const initialEvidence = path.join(evidence, 'first-launch');
  const port = await freePort();
  const origin = 'http://localhost:' + port;
  let page = await check('packaged boot with isolated profile and absent source override', async () => {
    const result = await boot(appPath, profile, initialEvidence, port);
    const runtime = events(initialEvidence).find((event) => event.event === 'window-ready');
    assert(runtime, 'The host must emit its actual runtime identity.');
    assert.equal(runtime.origin, origin);
    assert.equal(runtime.site, site);
    assert.equal(runtime.profile, profile);
    assert.equal(runtime.packaged, true);
    assert.equal(runtime.live, false);
    assert.equal(runtime.artifactSha256, identity.artifactSha256);
    fs.writeFileSync(path.join(evidence, 'runtime.json'), JSON.stringify(runtime, null, 2) + '\n');
    return result;
  });
  // A Page is not a receipt value.
  checks[checks.length - 1].detail = { origin, profile, bundledSite: site };
  await check('sandboxed renderer and comfortable desktop window', async () => {
    const renderer = await page.evaluate(() => ({ require: typeof require, process: typeof process, ipc: typeof ipcRenderer }));
    assert.deepEqual(renderer, { require: 'undefined', process: 'undefined', ipc: 'undefined' });
    const native = await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const preferences = window.webContents.getLastWebPreferences();
      return { bounds: window.getBounds(), sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation,
        nodeIntegration: preferences.nodeIntegration, webviewTag: preferences.webviewTag };
    });
    assert(native.bounds.width >= 1000 && native.bounds.height >= 750);
    assert.equal(native.sandbox, true);
    assert.equal(native.contextIsolation, true);
    assert.equal(native.nodeIntegration, false);
    assert.equal(native.webviewTag, false);
    return native;
  });
  await check('host serves exact immutable artifact and honest missing resources', async () => {
    const document = await request(origin, '/');
    assert.equal(document.status, 200);
    assert.deepEqual(document.body, fs.readFileSync(path.join(site, 'index.html')));
    const served = JSON.parse((await request(origin, '/build-identity.json')).body);
    assert.equal(served.artifactSha256, identity.artifactSha256);
    const missing = await request(origin, '/audio/missing-host-test.m4a');
    assert.equal(missing.status, 404);
    assert(!missing.headers['content-type'].includes('html'));
    const hostile = await request(origin, '/', { Host: 'publisher.example' });
    assert.equal(hostile.status, 421);
  });
  await check('fresh offline boot reaches local Japanese article through desktop controls', async () => {
    await page.locator('.nav-symbol').click();
    await page.locator('.bubble-shelf').click();
    assert((await page.locator('.shelf-item').count()) >= 24);
    await page.locator('.shelf-item').filter({ has: page.locator('.shelf-title', { hasText: /^静かな朝$/ }) }).click();
    await page.waitForFunction(() => document.querySelectorAll('#reader .tok').length > 40);
    const text = await page.locator('#reader').innerText();
    assert(/[\u3040-\u30ff\u4e00-\u9fff]/.test(text));
    assert((await page.locator('#reader rt').count()) > 10);
    const blocked = await page.evaluate(async () => {
      try { await fetch('https://publisher.example/host-offline-probe'); return false; } catch { return true; }
    });
    assert(blocked);
    assert(events(initialEvidence).some((event) => event.event === 'network-blocked'));
    await page.screenshot({ path: path.join(evidence, 'desktop-reader.png') });
    return { characters: text.length, ruby: await page.locator('#reader rt').count() };
  });
  const captured = await check('mouse capture durably stores the selected word and article context', async () => {
    const token = page.locator('#reader .tok.content').nth(9);
    await token.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    const word = await token.getAttribute('data-word');
    await token.click();
    await page.locator('#reader-take').click();
    await page.waitForSelector('#capture-panel');
    const taken = (await recordSupport.waitForAppRecord(page, (record) => record.taken.length === 1)).taken;
    assert.equal(taken.length, 1);
    assert.equal(taken[0].id, word);
    assert.equal(taken[0].t, 'word');
    assert.equal(taken[0].ctx.scope, 'sent');
    assert.equal(typeof taken[0].ctx.p, 'string');
    return taken[0];
  });
  await check('bundled recorded AAC voice plays, seeks, and stops in Electron', async () => {
    // Observe real native Audio objects without replacing decoding/playback.
    // Corridor is an ES module; its private bindings are not a test API.
    await page.addInitScript(() => {
      window.__hostAudio = [];
      window.Audio = new Proxy(window.Audio, {
        construct(target, args, constructor) {
          const audio = Reflect.construct(target, args, constructor);
          window.__hostAudio.push(audio);
          return audio;
        },
      });
    });
    await openArticle(page, origin);
    await page.locator('.listen-toggle').click();
    try {
      await page.waitForFunction(() => window.__hostAudio.some((audio) => audio.currentTime > 0.1 && !audio.paused), null, { timeout: 15_000 });
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({ note: document.querySelector('#listen-note')?.textContent,
        audios: window.__hostAudio.map((audio) => ({ src: audio.src, time: audio.currentTime, duration: audio.duration,
          error: audio.error && { code: audio.error.code, message: audio.error.message }, codec: audio.canPlayType('audio/mp4; codecs="mp4a.40.2"') })) }));
      fs.writeFileSync(path.join(evidence, 'audio-failure.json'), JSON.stringify(diagnostic, null, 2) + '\n');
      throw error;
    }
    const playing = await page.evaluate(() => {
      const audio = window.__hostAudio.find((audio) => audio.currentTime > 0.1 && !audio.paused);
      window.__hostPlayingAudio = audio;
      return { source: audio.currentSrc, time: audio.currentTime, duration: audio.duration,
        codec: audio.canPlayType('audio/mp4; codecs="mp4a.40.2"') };
    });
    assert(playing.source.startsWith(origin + '/audio/s/ami/'));
    assert(playing.duration > 0.3 && playing.codec);
    const filePath = new URL(playing.source).pathname;
    const range = await request(origin, filePath, { Range: 'bytes=-31' });
    assert.equal(range.status, 206);
    assert.deepEqual(range.body, fs.readFileSync(path.join(site, filePath)).subarray(-31));
    await page.evaluate(() => { window.__hostPlayingAudio.currentTime = Math.min(window.__hostPlayingAudio.duration / 2, 1); });
    await page.waitForFunction(() => !window.__hostPlayingAudio.seeking && window.__hostPlayingAudio.currentTime >= 0.3);
    await page.locator('.listen-toggle').click();
    await page.waitForFunction(() => document.querySelector('.listen-toggle').getAttribute('aria-pressed') === 'false'
      && window.__hostAudio.every((audio) => audio.paused));
    return playing;
  });
  await check('microphone denied without gesture; user gesture records and plays fake audio', async () => {
    await page.waitForTimeout(2100);
    const denied = await page.evaluate(async () => {
      try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach((track) => track.stop()); return false; }
      catch (error) { return error.name === 'NotAllowedError'; }
    });
    assert(denied);
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'host-test-record';
      button.textContent = 'Record generated QA microphone';
      button.style.cssText = 'position:fixed;left:20px;top:80px;z-index:2147483647';
      button.onclick = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
          const chunks = [];
          recorder.ondataavailable = (event) => chunks.push(event.data);
          recorder.onstop = async () => {
            stream.getTracks().forEach((track) => track.stop());
            const blob = new Blob(chunks, { type: recorder.mimeType });
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            window.__hostRecording = { bytes: blob.size, type: blob.type, audio, url };
            try { await audio.play(); } catch (error) { window.__hostRecordError = error.message; }
          };
          recorder.start();
          setTimeout(() => recorder.stop(), 700);
        } catch (error) { window.__hostRecordError = error.name + ': ' + error.message; }
      };
      document.body.append(button);
    });
    // CDP pointer events do not activate a macOS application the way a user's
    // click does. Establish actual native focus before testing consent.
    await focusNativeWindow(application);
    assert(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFocused()));
    await page.locator('#host-test-record').click();
    await page.waitForFunction(() => window.__hostRecordError || window.__hostRecording?.audio.currentTime > 0.1);
    const result = await page.evaluate(() => ({ error: window.__hostRecordError, bytes: window.__hostRecording?.bytes,
      type: window.__hostRecording?.type, time: window.__hostRecording?.audio.currentTime }));
    assert(!result.error, result.error);
    assert(result.bytes > 100 && result.time > 0.1);
    await page.evaluate(() => { window.__hostRecording.audio.pause(); URL.revokeObjectURL(window.__hostRecording.url); });
    assert(events(initialEvidence).some((event) => event.event === 'microphone-decision' && event.granted));
    return { ...result, device: 'Chromium generated fake audio; real microphone never requested' };
  });
  await check('publisher gestures route safely and every child window is denied', async () => {
    await openArticle(page, origin);
    await fixtureLink(page, 'https://www.asahi.com/articles/host-qa', '_blank');
    await page.waitForTimeout(150);
    assert(events(initialEvidence).some((event) => event.event === 'publisher-open-simulated' && event.url === 'https://www.asahi.com/articles/host-qa'));
    const openedBefore = events(initialEvidence).filter((event) => event.event === 'publisher-open-simulated').length;
    for (const link of ['javascript:window.__unsafeHostLink=1', 'data:text/html,bad', 'file:///etc/passwd',
      'https://user:password@www.asahi.com/', 'https://localhost/', 'http://127.0.0.1/']) {
      await fixtureLink(page, link, '_blank');
    }
    await page.evaluate(() => {
      window.open('https://www.asahi.com/');
      window.open(location.origin + '/?entry=shelf');
      location.href = 'https://publisher.example/forbidden-navigation';
    });
    await page.waitForTimeout(200);
    assert(page.url().startsWith(origin + '/'));
    assert.equal(await page.evaluate(() => window.__unsafeHostLink), undefined);
    assert.equal(application.windows().length, 1);
    assert.equal(events(initialEvidence).filter((event) => event.event === 'publisher-open-simulated').length, openedBefore);
    assert(events(initialEvidence).filter((event) => event.event === 'child-window-denied').length >= 2);
    assert(events(initialEvidence).some((event) => event.event === 'navigation-denied'));
    await fixtureLink(page, origin + '/?entry=shelf', '_blank');
    await page.waitForURL(origin + '/?entry=shelf');
    await ready(page);
    assert((await page.locator('.shelf-item').count()) >= 24);
  });
  await check('native menu reload retains study record and phone-sized resizing remains usable', async () => {
    await application.evaluate(({ app, BrowserWindow }) => {
      app.focus({ steal: true });
      BrowserWindow.getAllWindows()[0].focus();
    });
    await Promise.all([page.waitForEvent('load'), application.evaluate(({ Menu, BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const item = Menu.getApplicationMenu().items.find((entry) => entry.label === 'View').submenu.items.find((entry) => entry.role === 'reload');
      // Public instance signature differs from the constructor click callback.
      item.click({}, window, window.webContents);
    })]);
    await ready(page);
    assert.deepEqual((await nativeRecord(page, 'after-native-menu-reload')).record.taken[0], captured);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(390, 844));
    await page.waitForFunction(() => window.innerWidth === 390);
    assert((await page.locator('.shelf-item').count()) >= 24);
    await page.screenshot({ path: path.join(evidence, 'phone-width.png') });
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1180, 860));
  });
  await check('desktop keyboard editing supports selection and replacement', async () => {
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'host-test-edit';
      input.style.cssText = 'position:fixed;left:20px;top:80px;z-index:2147483647';
      document.body.append(input);
      input.focus();
    });
    await page.keyboard.type('Japanese practice');
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('retained after editing');
    assert.equal(await page.locator('#host-test-edit').inputValue(), 'retained after editing');
  });
  let backupCheckpoint;
  let backupReplica;
  let personalNote;
  await check('actual desktop import and export retain complete v2 backup and immutable operation bytes', async () => {
    const before = await nativeRecord(page, 'before-v2-import');
    // Explicit synthetic prior learner admission. Matching fixture IDs are
    // not authentication; this package journey makes no CloudKit calls.
    const journal = JSON.parse(await page.evaluate(async () => {
      const core = await import('./modules/record-core.mjs');
      const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
      const policy = { binding: { ...installation.binding, sessionId: 'desktop-backup-source-session' },
        schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
      const source = await core.IndexedDbReplicationStore.open({ databaseName: 'desktop-synthetic-backup-source', policy,
        actor: { deviceId: 'desktop-synthetic-source-phone', incarnationId: 'desktop-synthetic-source-install' } });
      try {
        await source.commitLocal({ changeId: 'original-offline-desktop-note', binding: policy.binding, expectedRevision: 0,
          occurredAt: '2026-09-10T01:00:00.000Z', mutations: [], operations: [{ dependencies: [], payload: {
            kind: 'note.version', noteId: 'desktop-original-note', versionId: 'desktop-original-version', generation: null,
            supersedes: [], segments: [{ kind: 'original', text: 'Original synthetic note from the already-admitted learner.' }] } }] });
        return JSON.stringify(core.exportOperationJournal((await source.snapshot()).replica));
      } finally { await source.close(); }
    }));
    const record = { ...before.record, desktopBackupRoot: { retained: 'Original synthetic desktop backup root', nested: [1, { keep: true }] } };
    const archive = [...before.archive.turns, { id: 'desktop-synthetic-full-archive', surface: 'chat', role: 'user',
      content: 'Full original synthetic conversation retained by the packaged app.', ts: 1700000000010 }];
    await fixtureSupport.restoreAppFixture(page, record, { archive, journal });
    const restored = await nativeRecord(page, 'after-v2-import');
    assert.deepEqual(restored.installation, before.installation);
    const native = await nativeReplica(page);
    assert.deepEqual(native.replica.operations, journal.operations);
    assert.deepEqual(native.outbox, journal.operations); assert.equal(native.actor.sequence, 0);
    assert(restored.documents.some((document) => document.collection === 'kairo:record-host-commands' && document.value.type === 'host.restore/2'));
    if (!await page.locator('#export-store').count()) await page.locator('#tray').click();
    const downloadIndex = await nativeDownloads.evaluate((items) => items.length);
    await page.locator('#export-store').click();
    const download = await nativeDownload(downloadIndex);
    const file = path.join(evidence, 'desktop-v2-export.json');
    fs.copyFileSync(download.path, file, fs.constants.COPYFILE_EXCL);
    const bytes = fs.readFileSync(file); const exported = JSON.parse(bytes);
    assert.deepEqual(exported, fixtureSupport.createAppBackupFixture(record, archive, journal));
    await recordSupport.waitForAppRecord(page, (value) => value.stats?.lastExportTs > (record.stats?.lastExportTs || 0));
    backupCheckpoint = await nativeRecord(page, 'v2-before-packaged-restart');
    backupReplica = await nativeReplica(page);
    await page.screenshot({ path: path.join(evidence, 'desktop-v2-backup.png') });
    return { file, nativeDownload: download, sha256: createHash('sha256').update(bytes).digest('hex'), version: exported.version,
      counts: exported.counts, recordSha256: exported.sha256.record, archiveSha256: exported.sha256.archive,
      journalSha256: exported.sha256.journal, targetDatabase: restored.installation.databaseName,
      targetRevision: backupCheckpoint.revision, actorSequence: native.actor.sequence,
      admission: 'Synthetic already-admitted scope only; no account authentication or network transport.' };
  });
  await check('personal note composer commits original history and preserves its scoped session draft', async () => {
    const before = await nativeRecord(page, 'before-personal-note');
    const prior = await nativeReplica(page);
    assert.equal(await page.locator('#personal-note-input').count(), 1);
    assert.equal(await page.locator('#note-input').count(), 1, 'Personal note and builder feedback are separate inputs');
    const text = '  My Mac note: <b>猫</b> e\u0301 é 😀\nOriginal second line\t  ';
    await page.locator('#personal-note-input').fill(text);
    await page.locator('#personal-note-save').click();
    await page.waitForFunction(() => {
      const save = document.querySelector('#personal-note-save');
      return Boolean(save && !save.hasAttribute('data-pending'));
    });
    assert.equal(await page.locator('#personal-note-input').inputValue(), '');
    const committed = await nativeRecord(page, 'personal-note-committed');
    const native = await nativeReplica(page);
    assert.deepEqual(committed.installation, before.installation);
    const unchangedDocuments = (state) => state.rows.filter((row) => row.kind === 'document'
      && JSON.parse(row.text).collection !== 'kairo:record-host-commands');
    assert.deepEqual(unchangedDocuments(committed), unchangedDocuments(before), 'The note command cannot alter roots, scheduling, observations, archive or migration custody');
    assert.equal(native.actor.sequence, prior.actor.sequence + 1);
    assert.equal(native.replica.operations.length, prior.replica.operations.length + 1);
    assert.equal(native.outbox.length, prior.outbox.length + 1);
    const added = native.replica.operations.filter((row) => !prior.replica.operations.some((old) => old.opId === row.opId));
    assert.equal(added.length, 1);
    const operation = added[0];
    assert.equal(operation.actor.deviceId, prior.actor.deviceId);
    assert.equal(operation.actor.incarnationId, prior.actor.incarnationId);
    assert.deepEqual(operation.predecessor, prior.actor.predecessor);
    assert.deepEqual(operation.dependencies, []);
    assert.equal(operation.payload.kind, 'note.version');
    assert.equal(operation.payload.generation, null);
    assert.deepEqual(operation.payload.supersedes, []);
    assert.deepEqual(operation.payload.segments, [{ kind: 'original', text }]);
    assert.deepEqual(native.outbox.find((row) => row.opId === operation.opId), operation);
    assert.deepEqual(native.replica.operations.filter((row) => row.opId !== operation.opId), prior.replica.operations);
    const commands = committed.documents.filter((row) => row.collection === 'kairo:record-host-commands'
      && !before.documents.some((old) => old.collection === row.collection && old.id === row.id));
    assert.equal(commands.length, 1); assert.equal(commands[0].value.type, 'host.note-create/1');
    await page.waitForFunction((revision) => document.getElementById('record-notes')?.dataset.revision === String(revision), committed.revision);
    const visible = await page.evaluate((noteId) => {
      const row = [...document.querySelectorAll('article.record-note')].find((row) => row.dataset.noteId === noteId);
      return row ? [...row.querySelectorAll('.record-note-segment')].map((segment) => ({
        kind: segment.dataset.segmentKind, text: segment.textContent, childElements: segment.childElementCount })) : null;
    }, operation.payload.noteId);
    assert.deepEqual(visible, [{ kind: 'original', text, childElements: 0 }]);
    const draft = 'Unsent note belongs to this learner and this window 猫';
    await page.locator('#personal-note-input').fill(draft);
    const scopeKey = JSON.stringify(['personal-note', committed.installation.binding.accountId, committed.installation.binding.learnerId]);
    assert.equal(await page.locator('#personal-note-input').getAttribute('data-record-draft-key'), scopeKey);
    const drafts = JSON.parse(await page.evaluate(() => sessionStorage.getItem('kairo-record-drafts-v1')));
    assert.equal(drafts[scopeKey], draft); assert.equal(drafts['personal-note-input'], undefined);
    // Other synthetic draft keys are inert session data, never an authority
    // change. The actual composer must select its current learner's key only.
    await page.evaluate(() => {
      const key = 'kairo-record-drafts-v1'; const drafts = JSON.parse(sessionStorage.getItem(key));
      drafts['personal-note-input'] = 'Unscoped draft must not populate a learner field';
      drafts[JSON.stringify(['personal-note', 'different-synthetic-account', 'different-synthetic-learner'])] = 'Other learner draft must remain separate';
      sessionStorage.setItem(key, JSON.stringify(drafts));
    });
    await page.reload(); await ready(page); await page.locator('#tray').click();
    assert.equal(await page.locator('#personal-note-input').inputValue(), draft);
    assert.deepEqual((await nativeRecord(page, 'personal-note-same-window-reload')).rows, committed.rows);
    const downloadIndex = await nativeDownloads.evaluate((items) => items.length);
    await page.locator('#export-store').click();
    const download = await nativeDownload(downloadIndex);
    const file = path.join(evidence, 'desktop-personal-note-v2-export.json');
    fs.copyFileSync(download.path, file, fs.constants.COPYFILE_EXCL);
    const bytes = fs.readFileSync(file); const exported = JSON.parse(bytes);
    assert.equal(exported.version, 2); assert.equal(exported.completeness, 'complete');
    assert.deepEqual(exported.journal.operations, native.replica.operations);
    assert.deepEqual(exported, fixtureSupport.createAppBackupFixture(committed.record, committed.archive.turns, exported.journal));
    assert(!bytes.toString().includes(draft), 'An unsent session draft cannot become durable journal or backup content');
    await recordSupport.waitForAppRecord(page, (value) => value.stats?.lastExportTs > (committed.record.stats?.lastExportTs || 0));
    backupCheckpoint = await nativeRecord(page, 'personal-note-before-packaged-restart');
    backupReplica = await nativeReplica(page);
    assert.equal(backupReplica.actor.sequence, native.actor.sequence);
    assert.deepEqual(backupReplica.replica, native.replica); assert.deepEqual(backupReplica.outbox, native.outbox);
    personalNote = { operation, text, draft, scopeKey };
    await page.screenshot({ path: path.join(evidence, 'desktop-personal-notes.png'), fullPage: true });
    return { operation, actorSequence: native.actor.sequence, revision: committed.revision, scopeKey,
      sessionDraft: 'Exact own draft survives reload in the same window; other learner and unscoped keys remain unused.',
      file, nativeDownload: download, backupSha256: createHash('sha256').update(bytes).digest('hex') };
  });
  await application.close();
  application = null;
  const movedApp = path.join(evidence, 'relocated', 'Bunki.app');
  await check('moving the QA bundle preserves all bundled bytes and signature', () => {
    fs.mkdirSync(path.dirname(movedApp));
    const copy = spawnSync('ditto', [appPath, movedApp], { encoding: 'utf8', timeout: 120_000 });
    assert.equal(copy.status, 0, copy.stderr);
    assert.equal(verifyBundledArtifact(path.join(movedApp, 'Contents/Resources/site/corridor')).artifactSha256, identity.artifactSha256);
    const signature = spawnSync('codesign', ['--verify', '--deep', '--strict', movedApp], { encoding: 'utf8' });
    assert.equal(signature.status, 0, signature.stderr);
    return { movedApp };
  });
  await check('restart from relocated app retains real study record at the same origin', async () => {
    page = await boot(movedApp, profile, path.join(evidence, 'restart'), port);
    assert.equal(new URL(page.url()).origin, origin);
    const taken = (await nativeRecord(page, 'after-relocated-restart')).record.taken;
    assert.deepEqual(taken, [captured]);
    await openArticle(page, origin);
    assert((await page.locator('#reader .tok').count()) > 40);
    const runtime = events(path.join(evidence, 'restart')).find((event) => event.event === 'window-ready');
    assert.equal(runtime.site, path.join(movedApp, 'Contents/Resources/site/corridor'));
    assert.equal(runtime.profile, profile);
    await page.screenshot({ path: path.join(evidence, 'restart-reader.png') });
  });
  await check('relocated packaged process reopens exact v2 record archive journal and outbox', async () => {
    const reopened = await nativeRecord(page, 'v2-after-packaged-restart');
    assert.deepEqual(reopened.installation, backupCheckpoint.installation);
    assert.deepEqual(reopened.rows, backupCheckpoint.rows, 'Packaged restart must retain exact durable native rows');
    assert.deepEqual(await nativeReplica(page), backupReplica);
    assert.equal(processes.at(-1).hostAsarSha256, identity.hostAsarSha256);
    await page.locator('#tray').click();
    await page.waitForFunction((revision) => document.getElementById('record-notes')?.dataset.revision === String(revision), reopened.revision);
    const rendered = await page.evaluate((noteId) => {
      const row = [...document.querySelectorAll('article.record-note')].find((row) => row.dataset.noteId === noteId);
      return row ? [...row.querySelectorAll('.record-note-segment')].map((segment) => ({ text: segment.textContent, childElements: segment.childElementCount })) : null;
    }, personalNote.operation.payload.noteId);
    assert.deepEqual(rendered, [{ text: personalNote.text, childElements: 0 }]);
    assert.equal(await page.locator('#personal-note-input').inputValue(), '', 'A new native window begins a new unsent-draft session; no prior or other learner draft is imported');
    const drafts = JSON.parse(await page.evaluate(() => sessionStorage.getItem('kairo-record-drafts-v1') || '{}'));
    assert.equal(drafts[personalNote.scopeKey], undefined);
    await page.screenshot({ path: path.join(evidence, 'reopened-personal-notes.png'), fullPage: true });
    return { revision: reopened.revision, rows: reopened.rows.length,
      rowBytesSha256: createHash('sha256').update(JSON.stringify(reopened.rows)).digest('hex'),
      process: processes.at(-1) };
  });
  await application.close();
  application = null;
  await check('occupied port fails clearly without attaching to another server', async () => {
    let requests = 0;
    conflictServer = http.createServer((req, response) => { requests += 1; response.end('unrelated server'); });
    await new Promise((resolve, reject) => { conflictServer.once('error', reject); conflictServer.listen(port, '127.0.0.1', resolve); });
    const directory = path.join(evidence, 'port-conflict');
    fs.mkdirSync(directory);
    const log = fs.openSync(path.join(directory, 'electron.log'), 'wx');
    try {
      conflictChild = spawn(path.join(movedApp, 'Contents/MacOS/Bunki'), [], {
        env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
          ELECTRON_RUN_AS_NODE: '1', BUNKI_TEST_MODE: '1', BUNKI_TEST_PROFILE: path.join(directory, 'profile'),
          BUNKI_TEST_PORT: String(port), BUNKI_TEST_EVIDENCE: directory }, stdio: ['ignore', log, log], cwd: directory,
      });
      const code = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { conflictChild.kill('SIGKILL'); reject(new Error('Occupied-port child did not exit')); }, 45_000);
        conflictChild.once('error', (error) => { clearTimeout(timer); reject(error); });
        conflictChild.once('exit', (status) => { clearTimeout(timer); resolve(status); });
      });
      conflictChild = null;
      assert.equal(code, 1);
      assert.equal(requests, 0);
      assert(events(directory).some((event) => event.event === 'startup-failed' && event.code === 'EADDRINUSE'));
    } finally { fs.closeSync(log); }
    await new Promise((resolve) => conflictServer.close(resolve));
    conflictServer = null;
  });
  await check('no uncaught renderer errors', () => assert.deepEqual(pageErrors, []));
}

run().catch((error) => {
  if (!checks.some((check) => check.status === 'failed')) checks.push({ name: 'desktop journey', status: 'failed', error: error.message });
  console.error(error.stack);
  process.exitCode = 1;
}).finally(async () => {
  if (application) await application.close().catch(() => application.process().kill('SIGKILL'));
  if (conflictChild) conflictChild.kill('SIGKILL');
  if (conflictServer) conflictServer.close();
  if (evidence) {
    const receipt = { schemaVersion: 1, status: process.exitCode ? 'failed' : 'passed', appPath, identity, processes, checks, pageErrors,
      verifierSha256: createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
      limits: ['Local ad-hoc Mac QA only; no Developer ID or notarization.', 'Isolated synthetic learner profile; no operator records accessed.',
        'Microphone uses a generated fake device; real hardware permission remains a manual release check.',
        'Native menu commands use the public MenuItem API; physical macOS menu accelerator dispatch remains a manual check.',
        'Personal notes prove local original-text creation, native history and full backup only. Session drafts survive same-window reload and are not a cross-process backup promise.',
        'No sync, live providers, or iPhone claims.'] };
    fs.writeFileSync(path.join(evidence, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  }
});
