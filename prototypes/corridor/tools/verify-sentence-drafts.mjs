/** Durable sentence drafts through the ordinary UI and real browser restarts.
 * Native records are output only. The separately named synthetic cases inject
 * storage/timing/recovery faults, never a reducer, successful write, playback
 * completion, learner response, or writer grant. This is bounded technical
 * evidence; it does not establish hearing, comprehension or learner acceptance.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, webkit } from 'playwright-core';
import { silenceBrowserAudio, TEST_AUDIO_OUTPUT } from './browser-audio-silence.mjs';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { armRecordWriteFailure, clearRecordWriteFailure, readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';

assert(isAbsolute(process.env.KAIRO_SITE_DIR || ''), 'Supply an immutable, already built KAIRO_SITE_DIR');
const SITE = resolveCorridorSite(), OUT = resolveCorridorEvidence();
assert(!existsSync(join(OUT, 'receipt.json')), 'Use a fresh KAIRO_EVIDENCE_DIR');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const normalize = value => Array.isArray(value) ? value.map(normalize) : value !== null && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
const digest = value => sha(JSON.stringify(normalize(value)));
const manifest = JSON.parse(readFileSync(join(SITE, 'build-identity.json')));
const verifyFiles = () => {
  assert.equal(sha(JSON.stringify(manifest.files)), manifest.artifactSha256);
  for (const file of manifest.files) assert.equal(sha(readFileSync(join(SITE, file.path))), file.sha256, file.path);
};
verifyFiles();
const verifierSha256 = sha(readFileSync(new URL(import.meta.url)));
const audioSilenceHelperSha256 = sha(readFileSync(new URL('./browser-audio-silence.mjs', import.meta.url)));
const requiredAssets = ['corridor.js', 'corridor.css', 'sentence-practice.mjs', 'sentence-drafts.mjs', 'sentence-draft-controller.mjs'];
for (const asset of requiredAssets) assert(manifest.files.some(file => file.path === asset), `Candidate omits ${asset}`);
const engines = !process.env.KAIRO_BROWSER || process.env.KAIRO_BROWSER === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER];
assert(engines.every(engine => ['chromium', 'webkit'].includes(engine)), 'KAIRO_BROWSER must be chromium, webkit or all');
const viewportFilter = process.env.KAIRO_SENTENCE_DRAFT_VIEWPORT || process.env.KAIRO_SENTENCE_VIEWPORT || 'all';
assert(['all', 'desktop', 'phone'].includes(viewportFilter), 'KAIRO_SENTENCE_DRAFT_VIEWPORT must be desktop, phone or all');
const widths = viewportFilter === 'desktop' ? [1440] : viewportFilter === 'phone' ? [390] : [1440, 390];
const filters = new Set(process.argv.filter(arg => arg.startsWith('--case=')).map(arg => arg.slice(7)));
assert(process.argv.slice(2).every(arg => arg.startsWith('--case=')), 'Only --case=<name> arguments are supported');
const definitions = [], results = [], startedAt = new Date().toISOString();
const define = (name, body, fault = false) => definitions.push({ name, body, fault });
const SOURCE = { id: 'bunki-graded-n5-morning', title: '静かな朝', index: 9, word: '窓' };
const LATER_SOURCE = { id: 'bunki-graded-n5-station', title: '駅で待つ時間', index: 120, word: '窓' };
const PRODUCTION = '  私の部屋の窓を開けます。\n e\u0301 🚀　<draft>  ';
const LISTENING = '  An open window, a blue sky and a cool breeze.\n e\u0301 🚀　<draft>  ';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.m4a': 'audio/mp4' };
const privateKey = join(OUT, 'synthetic-localhost-key.pem'), certificate = join(OUT, 'synthetic-localhost-cert.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', privateKey, '-out', certificate,
  '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
let disconnected = false;
const server = createServer({ key: readFileSync(privateKey), cert: readFileSync(certificate) }, (request, response) => {
  if (disconnected) { request.socket.destroy(); return; }
  const pathname = new URL(request.url, 'https://127.0.0.1').pathname;
  const file = resolve(SITE, pathname === '/' ? 'index.html' : pathname.slice(1));
  try {
    assert(file.startsWith(`${SITE}/`) && statSync(file).isFile());
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
rmSync(privateKey); rmSync(certificate);
await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
const ORIGIN = `https://127.0.0.1:${server.address().port}`;

async function ready(page, protectedState = false) {
  await page.waitForFunction(() => document.body?.dataset.ready === '1', null, { timeout: 30000 });
  if (!protectedState) assert.equal(await page.locator('#store-alert').isVisible(), false);
}
async function attestRuntime(fixture, start, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && requiredAssets.some(path => !fixture.assetLoads.slice(start).some(row => row.path === path))) await delay(25);
  const assets = fixture.assetLoads.slice(start);
  for (const path of requiredAssets) assert(assets.some(row => row.path === path), `Actual document did not load ${path}`);
  assert(assets.every(row => row.sha256 === manifest.files.find(file => file.path === row.path)?.sha256), 'Actual loaded code differs from the candidate');
  fixture.observations.push({ name: 'actual-loaded-runtime', label, episode: fixture.episode, assets });
}
async function navigate(fixture, { protectedState = false } = {}) {
  const start = fixture.assetLoads.length;
  await fixture.page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(fixture.page, protectedState);
  await attestRuntime(fixture, start, 'front-door');
}
async function launch(fixture, { offline = false, protectedState = false } = {}) {
  assert(!fixture.context, 'The previous browser must be fully closed before relaunch');
  fixture.episode += 1;
  fixture.context = await ({ chromium, webkit }[fixture.engine]).launchPersistentContext(join(fixture.out, fixture.profile), {
    headless: true, viewport: { width: fixture.width, height: fixture.width === 390 ? 844 : 1050 }, locale: 'en-US',
    serviceWorkers: 'allow', acceptDownloads: true, ignoreHTTPSErrors: true,
    ...(fixture.engine === 'chromium' ? { args: ['--ignore-certificate-errors'] } : {}),
  });
  fixture.browserVersion = fixture.context.browser()?.version();
  await silenceBrowserAudio(fixture.context);
  await fixture.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  fixture.traceActive = true;
  // Passive observation of actual native Audio instances. The test-only mute
  // wrapper delegates native play; no event dispatch, seek, rate or duration change.
  await fixture.context.addInitScript(() => {
    const NativeAudio = window.Audio; window.__sentenceDraftNativeAudio = [];
    window.Audio = new Proxy(NativeAudio, { construct(target, args, newTarget) {
      const audio = Reflect.construct(target, args, newTarget);
      for (const eventName of ['loadedmetadata', 'playing', 'pause', 'ended', 'error']) audio.addEventListener(eventName, event => {
        window.__sentenceDraftNativeAudio.push({ event: eventName, src: audio.currentSrc || audio.src,
          currentTime: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : null,
          paused: audio.paused, ended: audio.ended, trusted: event.isTrusted, error: audio.error?.code || null, at: performance.now() });
      });
      return audio;
    } });
  });
  await fixture.context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN) return route.continue();
    fixture.externalRequests.push({ episode: fixture.episode, origin: url.origin, pathname: url.pathname });
    return route.abort();
  });
  if (offline) {
    if (fixture.engine === 'webkit') disconnected = true;
    else await fixture.context.setOffline(true);
  }
  fixture.page = fixture.context.pages()[0] || await fixture.context.newPage();
  fixture.page.setDefaultTimeout(15000);
  fixture.page.on('pageerror', error => fixture.errors.push({ episode: fixture.episode, message: error.message }));
  fixture.page.on('response', response => {
    const path = new URL(response.url()).pathname.slice(1);
    if (!requiredAssets.includes(path)) return;
    const work = response.body().then(bytes => fixture.assetLoads.push({ path, sha256: sha(bytes),
      episode: fixture.episode, fromServiceWorker: response.fromServiceWorker() }));
    fixture.assetWork.push(work); void work.catch(() => undefined);
  });
  fixture.lifecycle.push({ action: 'launch', episode: fixture.episode, profile: fixture.profile, offline, at: new Date().toISOString() });
  await navigate(fixture, { protectedState });
}
async function finishTrace(fixture, boundary = null) {
  if (!fixture.context || !fixture.traceActive) return;
  const file = join(fixture.out, `trace-${fixture.episode}${boundary ? `-${boundary}` : ''}.zip`);
  await fixture.context.tracing.stop({ path: file }); fixture.traceActive = false;
  fixture.traces.push({ episode: fixture.episode, path: file, sha256: sha(readFileSync(file)),
    ...(boundary ? { boundary, endedBeforeTimedEdits: true } : {}) });
}
async function close(fixture, { fast = false } = {}) {
  if (!fixture.context) return;
  const context = fixture.context, started = Date.now(), episode = fixture.episode;
  const lifecycle = { action: 'full-browser-close', episode, profile: fixture.profile, started, fast };
  try {
    for (const page of context.pages()) fixture.nativeAudio.push({ episode,
      events: await page.evaluate(() => window.__sentenceDraftNativeAudio || []).catch(() => []) });
    if (fast) {
      assert.equal(fixture.traceActive, false, 'Finish the preceding trace before the timed input/departure segment');
      lifecycle.departureStarted = Date.now(); lifecycle.pageClosures = [];
      await Promise.all(context.pages().map(async page => {
        const url = page.url(); page.once('close', () => lifecycle.pageClosures.push({ url, at: Date.now() })); await page.close();
      }));
      lifecycle.appPagesClosedAt = Date.now();
    } else {
      const pages = context.pages(), keeper = await context.newPage(); await keeper.goto('about:blank');
      await Promise.all(pages.map(page => page.close()));
      // Actual app clients close before the browser process so its worker can
      // finish activation. This does not advance application or audio clocks.
      await delay(1000);
    }
    await finishTrace(fixture);
  } finally {
    try { await context.close(); }
    finally {
      fixture.context = null;
      lifecycle.completed = Date.now(); fixture.lifecycle.push(lifecycle);
    }
  }
  await Promise.all(fixture.assetWork); fixture.assetWork = [];
  return lifecycle;
}
async function shelf(fixture) {
  const page = fixture.page;
  for (let step = 0; step < 12; step++) {
    const view = await page.locator('body').getAttribute('data-view'); if (view === 'shelf') return;
    if (view === 'sentence-practice' && await page.locator('#sentence-listening-text').count()) {
      await page.locator('#sentence-practice-back').click(); await page.locator('#sentence-production-text').waitFor(); continue;
    }
    if (view === 'drift') {
      await page.locator('#ginga-symbol').focus(); await page.keyboard.press('Enter'); await page.locator('.bubble-shelf').click();
    } else await page.locator('#back').click();
    await page.waitForFunction(previous => document.body.dataset.view !== previous, view);
  }
  assert.fail('Ordinary Back controls did not reach the bookshelf');
}
async function tray(fixture) { await shelf(fixture); await fixture.page.locator('#tray').click(); }
async function openSaved(fixture, entryId) {
  await tray(fixture); const page = fixture.page;
  if (!await page.locator('#sentence-practice-library').evaluate(node => node.open)) await page.locator('#sentence-practice-library summary').click();
  await page.locator(`[data-sentence-practice-id="${entryId}"]`).click(); await page.locator('#sentence-production-text').waitFor();
}
async function focusedInViewport(page, id) {
  await page.waitForFunction(id => {
    const node = document.getElementById(id);
    if (!node || document.activeElement !== node) return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.top >= 0 && box.bottom <= innerHeight;
  }, id);
}
async function resumeDraft(fixture, entryId, mode) {
  assert(['production', 'listening'].includes(mode));
  const before = await readAppRecordSnapshot(fixture.page); await tray(fixture); const page = fixture.page;
  if (!await page.locator('#sentence-practice-library').evaluate(node => node.open)) await page.locator('#sentence-practice-library summary').click();
  const control = page.locator(`[data-sentence-resume-mode="${mode}"][data-sentence-entry-id="${entryId}"]`);
  assert.equal(await control.count(), 1, 'The library offers one resume control for the exact entry and mode');
  await control.click(); await page.locator(`#sentence-${mode}-text`).waitFor();
  await focusedInViewport(page, `sentence-${mode}-text`);
  unchangedExcept(before, await readAppRecordSnapshot(page));
  fixture.observations.push({ name: 'ordinary-library-draft-resume', key: [entryId, mode], focusedEditor: `sentence-${mode}-text`,
    nativeRootsUnchanged: true, focusedEditorInViewport: true });
}
async function listening(fixture) {
  await fixture.page.locator('#sentence-listening-start').click(); await fixture.page.locator('#sentence-listening-text').waitFor();
}
async function practiceFromSource(fixture, source = SOURCE, { addListening = true, savePlace = false } = {}) {
  const page = fixture.page; await shelf(fixture);
  const sourceDoor = page.locator(`.shelf-item[data-passage="${source.id}"]:not([data-recommendation]) .shelf-open`);
  assert.equal(await sourceDoor.count(), 1, 'Source has one canonical bookshelf entry');
  await sourceDoor.click();
  await page.locator(`#reader .tok[data-index="${source.index}"][data-word="${source.word}"]`).click();
  if (savePlace) {
    await page.locator('#reader-place-save').click();
    await page.waitForFunction(() => document.getElementById('reader-place-note')?.textContent.includes('is saved'));
    const saved = await readAppRecordSnapshot(page);
    assert.equal(saved.rows.filter(row => row.kind === 'operation').length, 1, 'One ordinary reading-place save supplies the existing actor sequence for local restore');
  }
  await page.locator('#reader-sentence-practice').click(); await page.locator('#sentence-practice-confirm').waitFor();
  await page.locator('#sentence-choose-cloze').uncheck(); await page.locator('#sentence-choose-production').check();
  await page.locator('#sentence-practice-confirm').click(); await page.locator('#sentence-production-text').waitFor();
  if (addListening) { await page.locator('#sentence-add-listening').click(); await page.locator('#sentence-listening-start').waitFor(); }
  const state = await readAppRecordSnapshot(page);
  const entry = state.record.sentencePractice.entries.find(row => row.context.sourceId === source.id && row.context.index === source.index);
  assert(entry); assert.equal(entry.context.title, source.title);
  assert.deepEqual(entry.plan.contracts.map(row => row.skill), addListening ? ['meaning_to_production', 'audio_to_meaning'] : ['meaning_to_production']);
  return entry;
}
async function sourceDetour(fixture, mode, source = SOURCE) {
  const page = fixture.page, caller = mode === 'listening' ? 'sentence-listening-source' : 'learning-source-return';
  const before = await readAppRecordSnapshot(page);
  if (mode === 'production' && !await page.locator('.learning-source').evaluate(node => node.open)) await page.locator('.learning-source summary').click();
  await page.locator(`#${caller}`).click();
  await page.waitForFunction(index => document.body.dataset.view === 'reader' &&
    document.activeElement?.matches(`#reader .tok[data-index="${index}"]`), source.index);
  assert.equal(await page.locator('h1.view-title').textContent(), source.title);
  assert(await page.locator(`#reader .tok[data-index="${source.index}"]`).evaluate(node => {
    const box = node.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight;
  }), 'The exact source token is in view');
  await shot(fixture, `${fixture.phase}-${mode}-exact-source`);
  // Playwright scrolls an offscreen return control into view before its real
  // pointer click. Observe at capture time, before the app's click handler.
  await page.locator('#reader-source-back').evaluate(node => {
    window.__sentenceDraftSourceReturnClick = null;
    node.addEventListener('click', event => {
      window.__sentenceDraftSourceReturnClick = { scroll: Math.round(window.scrollY), trusted: event.isTrusted, at: performance.now() };
    }, { capture: true, once: true });
  });
  await page.locator('#reader-source-back').click(); await page.locator(`#sentence-${mode}-text`).waitFor();
  await focusedInViewport(page, caller);
  const clicked = await page.evaluate(() => window.__sentenceDraftSourceReturnClick);
  assert.equal(clicked?.trusted, true, 'Source position is sampled at the actual trusted return click');
  const after = await readAppRecordSnapshot(page);
  assert.deepEqual(after.record.readerPos, { ...before.record.readerPos, [source.id]: clicked.scroll },
    'Leaving the actual source saves exactly its observed scroll position');
  unchangedExcept(before, after, ['sentenceDrafts', 'readerPos']);
  fixture.observations.push({ name: 'actual-source-and-caller-focus', mode, sourceId: source.id, tokenIndex: source.index, caller,
    exactReaderPositionWrite: { before: before.record.readerPos, after: after.record.readerPos, click: clicked } });
  return { snapshot: after, click: clicked };
}
async function uiState(fixture) {
  return fixture.page.evaluate(() => {
    const binding = localStorage.getItem('kairo-local-record-binding-v1');
    const databaseName = binding ? JSON.parse(binding).databaseName : null;
    const key = databaseName ? `kairo-sentence-draft-recovery-v1:${databaseName}` : null;
    const editors = Object.fromEntries(['production', 'listening'].map(mode => {
      const input = document.getElementById(`sentence-${mode}-text`), status = document.getElementById(`sentence-${mode}-draft-status`);
      return [mode, { text: input?.value ?? null, readOnly: input?.readOnly ?? null,
        saveDisabled: document.getElementById(`sentence-${mode}-save`)?.disabled ?? null,
        status: status ? { text: status.textContent, state: status.dataset.state, revision: status.dataset.revision } : null }];
    }));
    return { view: document.body?.dataset.view, focusedId: document.activeElement?.id || null,
      overflow: document.documentElement.scrollWidth > innerWidth + 1, editors,
      sourceDisclosureOpen: document.querySelector('.learning-source')?.open ?? null,
      sourceReturnClick: window.__sentenceDraftSourceReturnClick || null,
      timedInputs: window.__sentenceDraftTimedInputs || null,
      recovery: { key, text: key ? localStorage.getItem(key) : null, installationText: binding },
      transcript: document.getElementById('sentence-listening-transcript')?.textContent ?? null,
      audioStatus: document.getElementById('sentence-listening-audio-status')?.textContent ?? null,
      nativeAudio: window.__sentenceDraftNativeAudio || [] };
  });
}
async function snapshot(fixture, label) {
  fixture.phase = label;
  const state = await readAppRecordSnapshot(fixture.page), ui = await uiState(fixture);
  for (const row of state.rows) assert.equal(sha(row.text), row.sha256);
  const file = join(fixture.out, `${label}.json`); writeFileSync(file, JSON.stringify({ ...state, ui }, null, 2) + '\n');
  fixture.snapshots.push({ label, path: file, sha256: sha(readFileSync(file)), revision: state.revision });
  return { ...state, ui };
}
async function shot(fixture, label) {
  await fixture.page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.race([Promise.allSettled(document.getAnimations().filter(animation =>
      Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished)), new Promise(done => setTimeout(done, 2000))]);
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  const stem = `${String(fixture.screenshots.length + 1).padStart(2, '0')}-${label}`;
  const file = join(fixture.out, `${stem}.png`); await fixture.page.screenshot({ path: file, fullPage: false });
  const ui = await uiState(fixture); assert.equal(ui.overflow, false, 'Actual viewport has no horizontal overflow');
  const uiFile = join(fixture.out, `${stem}-ui.json`); writeFileSync(uiFile, JSON.stringify(ui, null, 2) + '\n');
  fixture.screenshots.push({ label, path: file, sha256: sha(readFileSync(file)), ui: uiFile });
}
function draft(state, entryId, mode) { return state.record.sentenceDrafts?.entries.find(row => row.entryId === entryId && row.mode === mode) || null; }
function checkDraft(state, entryId, mode, text, { consumed = false, revision, transcriptOpened = false } = {}) {
  assert.equal(state.record.sentenceDrafts?.version, 1);
  const found = draft(state, entryId, mode); assert(found, `Missing durable ${mode} draft`);
  assert.deepEqual(Object.keys(found).sort(), ['entryId', 'mode', 'revision', 'text', 'consumed', ...(mode === 'listening' ? ['transcriptOpened'] : [])].sort(),
    'Drafts contain no playback count, grade, schedule, timestamp or response observation');
  assert.equal(found.text, text); assert.equal(found.consumed, consumed);
  assert.match(found.revision, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  if (revision) assert.equal(found.revision, revision);
  if (mode === 'listening') assert.equal(found.transcriptOpened, transcriptOpened);
  return found;
}
async function durableDraft(fixture, entryId, mode, text, options = {}) {
  const record = await waitForAppRecord(fixture.page, record => record.sentenceDrafts?.entries.some(row => row.entryId === entryId && row.mode === mode &&
    row.text === text && row.consumed === !!options.consumed && (mode !== 'listening' || row.transcriptOpened === !!options.transcriptOpened)),
  { description: `exact acknowledged ${mode} draft` });
  const found = checkDraft({ record }, entryId, mode, text, options);
  await fixture.page.waitForFunction(({ mode, revision }) => {
    const status = document.getElementById(`sentence-${mode}-draft-status`);
    return status?.dataset.state === 'saved' && status.dataset.revision === revision;
  }, { mode, revision: found.revision });
  return found;
}
async function edit(fixture, entryId, mode, text, options) {
  await fixture.page.locator(`#sentence-${mode}-text`).fill(text);
  assert.equal(await fixture.page.locator(`#sentence-${mode}-text`).inputValue(), text);
  return durableDraft(fixture, entryId, mode, text, options);
}
function unchangedExcept(before, after, allowed = []) {
  for (const key of new Set([...Object.keys(before.record), ...Object.keys(after.record)]))
    if (!allowed.includes(key)) assert.deepEqual(after.record[key], before.record[key], `Unexpected learner root change: ${key}`);
  assert.deepEqual(after.archive, before.archive, 'Drafting and unchecked responses preserve the archive');
  assert.deepEqual(after.installation, before.installation, 'Drafts cannot change installation authority');
  const syncRows = state => state.rows.filter(row => ['actor', 'operation', 'outbox'].includes(row.kind));
  assert.deepEqual(syncRows(after), syncRows(before), 'Drafts/responses cannot allocate learning operations or actor sequences');
}
function uncheckedResponse(state, submitted) {
  const matches = state.record.sentencePractice.responses.filter(row => row.id === submitted.revision);
  assert.equal(matches.length, 1, 'One explicit Save uses the exact draft revision as its stable response ID');
  const response = matches[0];
  assert.equal(response.entryId, submitted.entryId); assert.equal(response.mode, submitted.mode); assert.equal(response.text, submitted.text);
  assert.equal(response.observation.type, 'ProductionObserved'); assert.equal(response.observation.tier, 'B');
  assert.equal(Object.hasOwn(response.observation, 'grade'), false);
  if (submitted.mode === 'listening') {
    assert.equal(response.revealed, submitted.transcriptOpened); assert.equal(response.listening.completedPlays, 1);
    assert.equal(response.observation.rubricId, 'kairo-source-listening');
  }
  return response;
}
async function playToEnd(fixture) {
  const page = fixture.page;
  const before = await page.evaluate(() => window.__sentenceDraftNativeAudio.filter(row => row.event === 'ended').length);
  await page.locator('#sentence-listening-play').click();
  await page.waitForFunction(count => window.__sentenceDraftNativeAudio.filter(row => row.event === 'ended' && row.src.startsWith('blob:') &&
    row.trusted && row.ended && row.duration > 0).length > count, before, { timeout: 30000 });
  const events = await page.evaluate(() => window.__sentenceDraftNativeAudio);
  const ended = events.filter(row => row.event === 'ended').at(-1);
  assert(ended.trusted && ended.ended && ended.currentTime >= ended.duration - 0.1);
  assert(events.some(row => row.event === 'playing' && row.trusted && row.src === ended.src && row.at < ended.at));
  assert.match(await page.locator('#sentence-listening-audio-status').textContent(), /sentence finished/u);
  fixture.observations.push({ name: 'real-trusted-native-playback-ended', episode: fixture.episode, ended });
}
async function exportUi(fixture, label) {
  await tray(fixture);
  const before = await readAppRecordSnapshot(fixture.page), earliest = Date.now();
  const pending = fixture.page.waitForEvent('download'); await fixture.page.locator('#export-store').click();
  const file = join(fixture.out, `${label}.json`); await (await pending).saveAs(file);
  const backup = JSON.parse(readFileSync(file));
  assert.equal(backup.format, 'kairo-backup'); assert.equal(backup.completeness, 'complete');
  assert.equal(backup.sha256.record, digest(backup.record)); assert.equal(backup.sha256.archive, digest(backup.archive));
  if (backup.journal) assert.equal(backup.sha256.journal, digest(backup.journal));
  assert.deepEqual(backup.record, before.record, 'Actual UI export includes every exact current draft and learning root');
  await waitForAppRecord(fixture.page, record => record.stats.lastExportTs >= earliest);
  const after = await readAppRecordSnapshot(fixture.page), timestamp = after.record.stats.lastExportTs;
  assert(Number.isSafeInteger(timestamp) && timestamp >= earliest && timestamp <= Date.now());
  assert.deepEqual(after.record, { ...before.record, stats: { ...before.record.stats, lastExportTs: timestamp } });
  unchangedExcept(before, after, ['stats']); assert.equal(after.revision, before.revision + 1);
  fixture.observations.push({ name: 'actual-ui-export', file, sha256: sha(readFileSync(file)), version: backup.version,
    draftCount: backup.record.sentenceDrafts.entries.length, onlyExportTimestampChanged: true });
  return { before, after, file, backup };
}
async function importUi(fixture, file) {
  await tray(fixture);
  const timeOrigin = await fixture.page.evaluate(() => performance.timeOrigin), start = fixture.assetLoads.length;
  await fixture.page.locator('#import-file').setInputFiles(file);
  await fixture.page.waitForFunction(prior => performance.timeOrigin !== prior && document.body.dataset.ready === '1', timeOrigin, { timeout: 30000 });
  await ready(fixture.page); await attestRuntime(fixture, start, 'actual-ui-import-reload');
}

define('ordinary-drafts-restart-export-restore-offline', async fixture => {
  await shelf(fixture);
  await fixture.page.locator('#airead-link').click(); await fixture.page.locator('#airead-startingLevel').selectOption('N5');
  await waitForAppRecord(fixture.page, record => record.readingSettings?.startingLevel === 'N5'); await fixture.page.locator('#back').click();
  const entry = await practiceFromSource(fixture, SOURCE, { savePlace: true }), id = entry.plan.id;
  fixture.entryId = id;
  let baseline = await snapshot(fixture, 'confirmed-modes-before-drafting');
  assert.deepEqual(baseline.record.taken, []); assert.deepEqual(baseline.record.srs, {}); assert.deepEqual(baseline.record.revlog, []);
  assert.deepEqual(baseline.record.sentencePractice.responses, []); assert.deepEqual(baseline.record.sentencePractice.grades, []);
  const production = await edit(fixture, id, 'production', PRODUCTION);
  await sourceDetour(fixture, 'production');
  assert.equal(await fixture.page.locator('#sentence-production-text').inputValue(), PRODUCTION);
  const productionReturned = await snapshot(fixture, 'production-source-return-unsent');
  // The source visit has its own explicitly asserted scroll-position write.
  // Subsequent draft neutrality starts after that ordinary navigation effect.
  unchangedExcept(baseline, productionReturned, ['sentenceDrafts', 'readerPos']); baseline = productionReturned;

  await listening(fixture);
  assert.equal(await fixture.page.locator('#sentence-listening-text').inputValue(), '');
  assert.equal(await fixture.page.locator('#sentence-listening-transcript').count(), 0);
  await fixture.page.locator('#sentence-listening-reveal').click();
  const exposureOnly = await durableDraft(fixture, id, 'listening', '', { transcriptOpened: true });
  const exposed = await snapshot(fixture, 'transcript-opened-without-typing');
  unchangedExcept(baseline, exposed, ['sentenceDrafts']);
  assert.equal(await fixture.page.locator('#sentence-listening-save').isDisabled(), true);
  await shot(fixture, 'transcript-opened-without-typing');
  await close(fixture); await launch(fixture); await resumeDraft(fixture, id, 'production');
  assert.equal(await fixture.page.locator('#sentence-production-text').inputValue(), PRODUCTION);
  checkDraft(await snapshot(fixture, 'production-restored-before-any-save'), id, 'production', PRODUCTION, { revision: production.revision });
  await listening(fixture);
  await durableDraft(fixture, id, 'listening', '', { transcriptOpened: true, revision: exposureOnly.revision });
  assert.equal(await fixture.page.locator('#sentence-listening-transcript').textContent(), entry.context.quote);
  assert.match(await fixture.page.locator('main').textContent(), /transcript was opened while drafting this response/iu);
  assert.equal(await fixture.page.locator('#sentence-listening-save').isDisabled(), true);
  assert.equal((await uiState(fixture)).nativeAudio.filter(row => row.event === 'ended').length, 0);
  const listeningDraft = await edit(fixture, id, 'listening', LISTENING, { transcriptOpened: true });
  assert.notEqual(listeningDraft.revision, exposureOnly.revision, 'Typing after exposure-only revision creates its own identity');
  await sourceDetour(fixture, 'listening');
  assert.equal(await fixture.page.locator('#sentence-listening-text').inputValue(), LISTENING);
  await playToEnd(fixture);
  assert.equal(await fixture.page.locator('#sentence-listening-save').isDisabled(), false);
  const beforeRestart = await snapshot(fixture, 'both-exact-drafts-and-real-playback-before-close');
  checkDraft(beforeRestart, id, 'production', PRODUCTION, { revision: production.revision });
  checkDraft(beforeRestart, id, 'listening', LISTENING, { revision: listeningDraft.revision, transcriptOpened: true });
  unchangedExcept(baseline, beforeRestart, ['sentenceDrafts']); await shot(fixture, 'listening-draft-before-browser-close');
  await close(fixture); await launch(fixture); await openSaved(fixture, id);
  assert.equal(await fixture.page.locator('#sentence-production-text').inputValue(), PRODUCTION);
  await resumeDraft(fixture, id, 'listening');
  assert.equal(await fixture.page.locator('#sentence-listening-text').inputValue(), LISTENING);
  assert.equal(await fixture.page.locator('#sentence-listening-transcript').textContent(), entry.context.quote);
  assert.equal(await fixture.page.locator('#sentence-listening-save').isDisabled(), true, 'A real pre-close completed play gives no post-restart credit');
  const restoredDrafts = await snapshot(fixture, 'listening-restored-text-exposure-and-zero-playback');
  assert.equal(restoredDrafts.ui.nativeAudio.filter(row => row.event === 'ended').length, 0);
  unchangedExcept(beforeRestart, restoredDrafts); await shot(fixture, 'restored-listening-requires-new-completed-play');

  await fixture.page.locator('#sentence-practice-back').click(); await fixture.page.locator('#sentence-production-text').waitFor();
  await fixture.page.locator('#sentence-production-save').click();
  await waitForAppRecord(fixture.page, record => record.sentencePractice.responses.some(row => row.id === production.revision));
  await fixture.page.waitForFunction(() => document.getElementById('sentence-production-text')?.value === '');
  await focusedInViewport(fixture.page, 'sentence-production-text');
  fixture.observations.push({ name: 'ordinary-explicit-save-focus', mode: 'production', target: 'sentence-production-text', inViewport: true });
  const written = await snapshot(fixture, 'explicit-production-save-consumes-submitted-identity');
  const writtenResponse = uncheckedResponse(written, production);
  checkDraft(written, id, 'production', PRODUCTION, { consumed: true, revision: production.revision });
  checkDraft(written, id, 'listening', LISTENING, { revision: listeningDraft.revision, transcriptOpened: true });
  assert.equal(written.record.sentencePractice.responses.length, 1);
  unchangedExcept(restoredDrafts, written, ['sentenceDrafts', 'sentencePractice']);
  assert.deepEqual(written.record.sentencePractice.entries, baseline.record.sentencePractice.entries);
  assert.deepEqual(written.record.sentencePractice.grades, []);
  const nextProduction = await edit(fixture, id, 'production', PRODUCTION);
  assert.notEqual(nextProduction.revision, production.revision, 'A new same-text response draft is a distinct edit');
  await listening(fixture);
  assert.equal(await fixture.page.locator('#sentence-listening-save').isDisabled(), true);
  await playToEnd(fixture);
  await fixture.page.locator('#sentence-listening-save').click(); await fixture.page.locator('#sentence-listening-start').waitFor();
  assert.equal(await fixture.page.locator('#sentence-response-history-heading').getAttribute('tabindex'), '-1');
  await focusedInViewport(fixture.page, 'sentence-response-history-heading');
  fixture.observations.push({ name: 'ordinary-explicit-save-focus', mode: 'listening', newerListeningDraft: false,
    target: 'sentence-response-history-heading', inViewport: true });
  const listened = await snapshot(fixture, 'explicit-listening-save-preserves-production-mode');
  uncheckedResponse(listened, listeningDraft);
  assert.deepEqual(listened.record.sentencePractice.responses.find(row => row.id === writtenResponse.id), writtenResponse);
  checkDraft(listened, id, 'listening', LISTENING, { consumed: true, revision: listeningDraft.revision, transcriptOpened: true });
  checkDraft(listened, id, 'production', PRODUCTION, { revision: nextProduction.revision });
  assert.equal(await fixture.page.locator('#sentence-production-text').inputValue(), PRODUCTION);
  assert.equal(listened.record.sentencePractice.responses.length, 2); assert.deepEqual(listened.record.sentencePractice.grades, []);
  unchangedExcept(written, listened, ['sentenceDrafts', 'sentencePractice']); await shot(fixture, 'unchecked-saves-preserve-the-other-mode');

  const emptyProduction = await edit(fixture, id, 'production', '');
  assert.notEqual(emptyProduction.revision, nextProduction.revision);
  await listening(fixture);
  assert.equal(await fixture.page.locator('#sentence-listening-text').inputValue(), '');
  assert.equal(await fixture.page.locator('#sentence-listening-transcript').count(), 0, 'A consumed response starts a fresh exercise without inherited exposure');
  const nextListening = await edit(fixture, id, 'listening', '  A deliberately removed listening draft e\u0301 🚀  ');
  await fixture.page.locator('#sentence-listening-reveal').click();
  const reexposed = await durableDraft(fixture, id, 'listening', nextListening.text, { transcriptOpened: true });
  assert.notEqual(reexposed.revision, nextListening.revision, 'Exposure participates in edit identity');
  const emptyListening = await edit(fixture, id, 'listening', '', { transcriptOpened: true });
  assert.notEqual(emptyListening.revision, reexposed.revision);
  const cleared = await snapshot(fixture, 'deliberate-empty-revisions-before-close');
  unchangedExcept(listened, cleared, ['sentenceDrafts']);
  await close(fixture); await launch(fixture); await openSaved(fixture, id);
  assert.equal(await fixture.page.locator('#sentence-production-text').inputValue(), '');
  assert.equal(await fixture.page.locator('#sentence-production-save').isDisabled(), true);
  checkDraft(await snapshot(fixture, 'production-empty-restored'), id, 'production', '', { revision: emptyProduction.revision });
  await listening(fixture);
  assert.equal(await fixture.page.locator('#sentence-listening-text').inputValue(), '');
  assert.equal(await fixture.page.locator('#sentence-listening-save').isDisabled(), true);
  const recoveryBaseline = await snapshot(fixture, 'closed-profile-recovery-point-record');
  checkDraft(recoveryBaseline, id, 'listening', '', { revision: emptyListening.revision, transcriptOpened: true });
  unchangedExcept(cleared, recoveryBaseline); await shot(fixture, 'explicit-empty-listening-draft-survives-close');
  assert.equal(recoveryBaseline.rows.filter(row => row.kind === 'operation').length, 1);
  await close(fixture);
  // This is a closed copy of one ordinarily evolved installation, containing
  // its already authored reading.resume operation. It is a local rollback
  // checkpoint, never a newly enrolled device or copied ownership grant.
  cpSync(join(fixture.out, fixture.profile), join(fixture.out, 'profile-recovery-point'), { recursive: true, errorOnExist: true, force: false });
  await launch(fixture); await openSaved(fixture, id);
  await edit(fixture, id, 'production', '  Exported production after the local checkpoint.\n e\u0301 🚀  ');
  await listening(fixture);
  await edit(fixture, id, 'listening', '  Exported listening after the local checkpoint.\n e\u0301 🚀  ', { transcriptOpened: true });
  const later = await practiceFromSource(fixture, LATER_SOURCE, { addListening: false });
  const laterText = '  A previously absent sentence draft comes from the backup.\n 新しい文 e\u0301 🚀  ';
  const laterDraft = await edit(fixture, later.plan.id, 'production', laterText);
  const exported = await exportUi(fixture, 'sentence-drafts-actual-ui-backup');
  assert.equal(exported.backup.version, 2, 'Actual operation-bearing export retains learner ownership binding');
  assert(exported.backup.journal);
  await close(fixture); await launch(fixture);
  assert.deepEqual((await readAppRecordSnapshot(fixture.page)).record, exported.after.record, 'Export metadata and exact drafts survive full browser close');
  await close(fixture); fixture.profile = 'profile-foreign'; await launch(fixture); await tray(fixture);
  const foreignBefore = await readAppRecordSnapshot(fixture.page);
  assert.notEqual(foreignBefore.installation.binding.learnerId, recoveryBaseline.installation.binding.learnerId);
  await fixture.page.locator('#import-file').setInputFiles(exported.file);
  await fixture.page.waitForFunction(() => document.getElementById('record-portability-status')?.textContent.includes('belongs to a different learner'));
  assert.deepEqual(await readAppRecordSnapshot(fixture.page), foreignBefore, 'Ownership refusal leaves every native row and authority field unchanged');
  await fixture.page.locator('#record-portability-status').scrollIntoViewIfNeeded(); await shot(fixture, 'foreign-learner-backup-refused');
  fixture.observations.push({ name: 'ordinary-foreign-learner-refusal', nativeRowsAndAuthorityUnchanged: true });
  await close(fixture); fixture.profile = 'profile-recovery-point'; await launch(fixture);
  assert.deepEqual((await readAppRecordSnapshot(fixture.page)).record, recoveryBaseline.record);
  await importUi(fixture, exported.file);
  const restored = await snapshot(fixture, 'same-installation-local-checkpoint-restored');
  const currentKeys = new Set(recoveryBaseline.record.sentenceDrafts.entries.map(row => JSON.stringify([row.entryId, row.mode])));
  const expectedRecord = { ...exported.before.record,
    teacherDrafts: exported.before.record.teacherDrafts,
    sentenceDrafts: { version: 1, entries: [...exported.before.record.sentenceDrafts.entries.filter(row => !currentKeys.has(JSON.stringify([row.entryId, row.mode]))),
      ...recoveryBaseline.record.sentenceDrafts.entries] } };
  assert.deepEqual(restored.record, expectedRecord, 'Restore keeps the current exact tuple rows and imports only absent draft tuples');
  assert.deepEqual(restored.archive, exported.before.archive);
  assert.deepEqual(restored.installation, recoveryBaseline.installation, 'Restore retains the same installation authority');
  for (const kind of ['operation', 'actor', 'outbox']) assert.deepEqual(restored.rows.filter(row => row.kind === kind),
    recoveryBaseline.rows.filter(row => row.kind === kind), `Restore preserves the already authored ${kind} history without allocating it twice`);
  checkDraft(restored, id, 'production', '', { revision: emptyProduction.revision });
  checkDraft(restored, id, 'listening', '', { revision: emptyListening.revision, transcriptOpened: true });
  checkDraft(restored, later.plan.id, 'production', laterText, { revision: laterDraft.revision });
  fixture.observations.push({ name: 'legitimate-same-installation-local-restore', checkpointRevision: recoveryBaseline.revision,
    currentEmptyRowsRetained: 2, absentDraftImported: later.plan.id, existingOperationRetainedOnce: true, freshDeviceRecovery: 'not exercised' });
  await openSaved(fixture, later.plan.id); assert.equal(await fixture.page.locator('#sentence-production-text').inputValue(), laterText);
  const warmedSource = await sourceDetour(fixture, 'production', LATER_SOURCE);
  const expectedOfflineRecord = { ...expectedRecord, readerPos: { ...expectedRecord.readerPos, [LATER_SOURCE.id]: warmedSource.click.scroll } };
  assert.deepEqual(warmedSource.snapshot.record, expectedOfflineRecord, 'Warming the restored source changes only its exact click-time reading position');
  await snapshot(fixture, 'restored-source-warmup-checkpoint');
  await fixture.page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  await fixture.page.evaluate(() => navigator.serviceWorker.ready);
  await close(fixture); await launch(fixture, { offline: true });
  assert.deepEqual((await snapshot(fixture, 'full-offline-browser-startup-record')).record, expectedOfflineRecord,
    'Full offline startup retains every post-warmup record root exactly');
  await openSaved(fixture, id);
  assert.equal(await fixture.page.locator('#sentence-production-text').inputValue(), '');
  await listening(fixture);
  assert.equal(await fixture.page.locator('#sentence-listening-text').inputValue(), '');
  assert.equal(await fixture.page.locator('#sentence-listening-transcript').textContent(), entry.context.quote);
  assert.equal(await fixture.page.locator('#sentence-listening-save').isDisabled(), true);
  await openSaved(fixture, later.plan.id);
  assert.equal(await fixture.page.locator('#sentence-production-text').inputValue(), laterText);
  const offlineSource = await sourceDetour(fixture, 'production', LATER_SOURCE); await shot(fixture, 'full-browser-offline-restart-restored-draft');
  const offline = await snapshot(fixture, 'restored-offline-exact-record');
  assert.deepEqual(offline.record, { ...expectedOfflineRecord, readerPos: { ...expectedOfflineRecord.readerPos, [LATER_SOURCE.id]: offlineSource.click.scroll } });
  assert.deepEqual(offline.record.sentencePractice.responses, listened.record.sentencePractice.responses);
  assert.deepEqual(offline.record.sentencePractice.grades, []); assert.deepEqual(offline.record.srs, {}); assert.deepEqual(offline.record.revlog, []);
  fixture.observations.push({ name: 'ordinary-draft-boundary', exactMultilineUnicode: true, modesIndependent: true,
    transcriptOpenedWithoutTypingSurvivedRestart: true, completedPlayNotPersisted: true, explicitUncheckedSaves: 2,
    stableResponseIds: [production.revision, listeningDraft.revision], currentEmptyRevisions: [emptyProduction.revision, emptyListening.revision],
    offline: fixture.engine === 'webkit' ? 'HTTPS listener disconnected before full browser reopen' : 'Chromium offline before full browser reopen',
    noGradesOrScheduling: true, fullLearnerJourney: 'not claimed', hearingOrComprehension: 'not claimed' });
});

/** Hold only the real response transaction after its actual native puts. Real
 * IndexedDB requests keep that transaction alive; release permits its actual
 * completion. The fault never fabricates a successful acknowledgement. */
async function armResponseHold(fixture, responseId) {
  assert(fixture.fault, 'Native timing hooks belong only to explicit synthetic profiles');
  const before = await readAppRecordSnapshot(fixture.page);
  await fixture.page.evaluate(({ responseId, databaseName }) => {
    if (window.__sentenceDraftResponseFault) throw new Error('Response timing fault already armed');
    const nativeTransaction = IDBDatabase.prototype.transaction, nativePut = IDBObjectStore.prototype.put;
    const matched = new WeakSet();
    const fault = { responseId, fired: 0, durable: false, aborted: false, released: false, active: true, record: null, putKinds: [] };
    const hold = tx => {
      if (fault.released || !fault.active) return;
      const request = tx.objectStore('kairo_replication_rows').get('synthetic-sentence-response-keepalive');
      request.onsuccess = () => hold(tx);
    };
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = nativeTransaction.apply(this, args);
      if (this.name === databaseName && args[1] === 'readwrite') {
        tx.addEventListener('abort', () => { if (matched.has(tx)) fault.aborted = true; });
        tx.addEventListener('complete', () => { if (matched.has(tx)) fault.durable = true; });
      }
      return tx;
    };
    IDBObjectStore.prototype.put = function (...args) {
      const request = nativePut.apply(this, args);
      if (!fault.active || this.transaction.db.name !== databaseName || this.name !== 'kairo_replication_rows') return request;
      const row = args[0], document = row?.kind === 'document' ? JSON.parse(row.text) : null;
      if (document?.collection === 'learner-record' && document.value.sentencePractice?.responses.some(response => response.id === responseId)) {
        matched.add(this.transaction); fault.record = document.value;
      }
      if (!matched.has(this.transaction)) return request;
      fault.putKinds.push(row.kind);
      if (document?.collection === 'kairo:record-host-commands' && !fault.fired) { fault.fired += 1; hold(this.transaction); }
      return request;
    };
    fault.release = () => { fault.released = true; };
    fault.disarm = () => { fault.active = false; fault.released = true; IDBDatabase.prototype.transaction = nativeTransaction; IDBObjectStore.prototype.put = nativePut; };
    window.__sentenceDraftResponseFault = fault;
  }, { responseId, databaseName: before.installation.databaseName });
}
async function responseFault(fixture, { release = false, disarm = false } = {}) {
  return fixture.page.evaluate(({ release, disarm }) => {
    const fault = window.__sentenceDraftResponseFault; if (!fault) return null;
    if (release) fault.release();
    const value = { responseId: fault.responseId, fired: fault.fired, durable: fault.durable, aborted: fault.aborted,
      released: fault.released, record: fault.record, putKinds: fault.putKinds };
    if (disarm) { fault.disarm(); delete window.__sentenceDraftResponseFault; } return value;
  }, { release, disarm });
}
function pendingRecovery(ui, entryId, mode) {
  assert(ui.recovery.text, 'Input creates a synchronous recovery journal before durable publication');
  const recovery = JSON.parse(ui.recovery.text); assert.equal(recovery.installation, ui.recovery.installationText);
  const row = recovery.entries.find(row => row.key.entryId === entryId && row.key.mode === mode);
  assert(row); return row;
}
define('synthetic-delayed-response-a-b-a-and-empty', async fixture => {
  const entry = await practiceFromSource(fixture), id = entry.plan.id;
  await listening(fixture); const other = await edit(fixture, id, 'listening', LISTENING);
  await fixture.page.locator('#sentence-practice-back').click(); await fixture.page.locator('#sentence-production-text').waitFor();
  const aText = '  A submitted sentence returns to the same exact bytes.\n 窓 e\u0301 🚀  ';
  for (const [label, finalText] of [['same-text', aText], ['explicit-empty', '']]) {
    const submitted = await edit(fixture, id, 'production', aText);
    const before = await snapshot(fixture, `${label}-before-explicit-save`);
    await armResponseHold(fixture, submitted.revision);
    await fixture.page.locator('#sentence-production-save').click();
    await fixture.page.waitForFunction(() => window.__sentenceDraftResponseFault?.fired === 1);
    const held = await responseFault(fixture); assert.equal(held.durable, false); assert.equal(held.aborted, false);
    uncheckedResponse({ record: held.record }, submitted);
    checkDraft({ record: held.record }, id, 'production', aText, { consumed: true, revision: submitted.revision });
    assert.deepEqual(held.record.sentenceDrafts.entries.find(row => row.entryId === id && row.mode === 'listening'), other);
    assert.equal(await fixture.page.locator('#sentence-production-text').evaluate(node => node.readOnly), false,
      'New draft edits must remain real UI input while the explicit response is pending');
    await shot(fixture, `${label}-actual-native-save-held`);
    // Trace serialization can take seconds. Finish it before starting the
    // timed edits, then retain actual input events, native/UI snapshots and
    // page/context close observations for the following bounded interval.
    await finishTrace(fixture, `${label}-before-timed-edits`);
    await fixture.page.locator('#sentence-production-text').evaluate(node => {
      window.__sentenceDraftTimedInputs = [];
      node.addEventListener('input', event => window.__sentenceDraftTimedInputs.push({ text: node.value,
        wallTime: Date.now(), pageTime: performance.now(), trusted: event.isTrusted,
        inputType: event.inputType ?? null, data: event.data ?? null, isComposing: event.isComposing ?? null }), { capture: true, passive: true });
    });
    const middleText = '  Intermediate B has its own revision.\n 猫  ';
    await fixture.page.locator('#sentence-production-text').fill(middleText);
    const middleUi = await uiState(fixture);
    // A real fill can emit multiple input events. Preserve every observed
    // event before checking the completed field and recovery-journal state.
    writeFileSync(join(fixture.out, `${label}-observed-middle-inputs.json`), JSON.stringify({ expectedText: middleText, middleUi }, null, 2) + '\n');
    const middle = pendingRecovery(middleUi, id, 'production').latest;
    assert.equal(middleUi.editors.production.text, middleText); assert.equal(middle.text, middleText);
    assert.equal(middleUi.timedInputs.at(-1)?.text, middleText); assert.notEqual(middle.revision, submitted.revision);
    const finalInputStarted = Date.now(); await fixture.page.locator('#sentence-production-text').fill(finalText);
    const pendingUi = await uiState(fixture), inputEvents = pendingUi.timedInputs;
    writeFileSync(join(fixture.out, `${label}-observed-final-inputs.json`), JSON.stringify({ expectedText: finalText,
      finalInputStarted, middleUi, pendingUi, inputEvents }, null, 2) + '\n');
    const latest = pendingRecovery(pendingUi, id, 'production').latest;
    const finalEvents = inputEvents.slice(middleUi.timedInputs.length);
    assert(finalEvents.length > 0, 'The final real fill produces an observed input event');
    assert.equal(finalEvents.at(-1).text, finalText); assert.equal(pendingUi.editors.production.text, finalText);
    assert.equal(finalEvents.at(-1).trusted, true, 'The final matching input event must be trusted; the harness never synthesizes trust');
    const editedAt = finalEvents.at(-1).wallTime;
    assert.equal(latest.text, finalText); assert.equal(latest.consumed, false);
    assert.notEqual(latest.revision, middle.revision); assert.notEqual(latest.revision, submitted.revision);
    assert.equal(pendingUi.editors.production.status.revision, latest.revision);
    assert.notEqual(pendingUi.editors.production.status.state, 'saved');
    assert.equal(pendingUi.editors.production.saveDisabled, true);
    writeFileSync(join(fixture.out, `${label}-explicit-held-transaction-and-pending-edit.json`), JSON.stringify({ held, pendingUi, middle, latest, inputEvents }, null, 2) + '\n');
    await responseFault(fixture, { release: true });
    await fixture.page.waitForFunction(() => window.__sentenceDraftResponseFault?.durable === true);
    const committed = await snapshot(fixture, `${label}-after-real-response-completion`), proof = await responseFault(fixture, { disarm: true });
    assert.equal(proof.aborted, false); uncheckedResponse(committed, submitted);
    assert.equal(await fixture.page.locator('#sentence-production-text').inputValue(), finalText);
    const closure = await close(fixture, { fast: true });
    const departureAfterMs = closure.departureStarted - editedAt, appPagesClosedAfterMs = closure.appPagesClosedAt - editedAt;
    const fullContextClosedAfterMs = closure.completed - editedAt;
    assert(departureAfterMs >= 0 && appPagesClosedAfterMs < 750,
      'The actual app pages must close before the nominal new-edit debounce; full process shutdown is timed separately');
    fixture.observations.push({ name: 'explicit-synthetic-response-hold', label, responseId: submitted.revision,
      middleRevision: middle.revision, latestRevision: latest.revision, finalInputStarted, inputEvents,
      departureAfterMs, appPagesClosedAfterMs, fullContextClosedAfterMs, pageClosures: closure.pageClosures,
      latestNativeRevisionBeforeClose: draft(committed, id, 'production')?.revision, nativeTransactionCompleted: proof.durable,
      traceEndedBeforeTimedEdits: true, traceCoversTimedEdits: false, fullProcessUnder750msClaim: false,
      injectedEndedEvents: 0, injectedNativeRecordRows: 0 });
    await launch(fixture); await openSaved(fixture, id);
    assert.equal(await fixture.page.locator('#sentence-production-text').inputValue(), finalText);
    await durableDraft(fixture, id, 'production', finalText, { revision: latest.revision });
    const reopened = await snapshot(fixture, `${label}-newer-revision-after-full-restart`);
    const response = uncheckedResponse(reopened, submitted);
    assert.deepEqual(response, committed.record.sentencePractice.responses.find(row => row.id === submitted.revision));
    assert.equal(reopened.record.sentencePractice.responses.length, before.record.sentencePractice.responses.length + 1);
    checkDraft(reopened, id, 'listening', LISTENING, { revision: other.revision });
    unchangedExcept(before, reopened, ['sentencePractice', 'sentenceDrafts']);
    assert.deepEqual(reopened.record.sentencePractice.grades, []);
    await shot(fixture, `${label}-newer-draft-preserved-after-held-save`);
  }
}, true);

define('synthetic-draft-quota-retains-recovery-and-other-mode', async fixture => {
  const entry = await practiceFromSource(fixture), id = entry.plan.id;
  const production = await edit(fixture, id, 'production', PRODUCTION);
  await listening(fixture); const other = await edit(fixture, id, 'listening', LISTENING);
  await fixture.page.locator('#sentence-practice-back').click(); await fixture.page.locator('#sentence-production-text').waitFor();
  const before = await snapshot(fixture, 'quota-before-native-write-fault');
  await armRecordWriteFailure(fixture.page, 'quota', { roots: ['sentenceDrafts'] });
  const text = '  Draft kept through a real native quota failure.\n 窓 e\u0301 🚀  ';
  await fixture.page.locator('#sentence-production-text').fill(text);
  await fixture.page.waitForFunction(() => window.__recordTestFault?.fired > 0);
  await fixture.page.waitForFunction(() => document.getElementById('sentence-production-draft-status')?.dataset.state === 'unavailable');
  await delay(800); // Observe a real failed coalesced write without a retry spin.
  const fault = await clearRecordWriteFailure(fixture.page); assert.equal(fault.fired, 1);
  const failed = await snapshot(fixture, 'quota-failed-native-record-and-retained-journal');
  assert.deepEqual(failed.rows, before.rows, 'The real failed draft transaction leaves every native row unchanged');
  checkDraft(failed, id, 'production', PRODUCTION, { revision: production.revision });
  checkDraft(failed, id, 'listening', LISTENING, { revision: other.revision });
  const latest = pendingRecovery(failed.ui, id, 'production').latest;
  assert.equal(latest.text, text); assert.equal(failed.ui.editors.production.text, text);
  assert.equal(failed.ui.editors.production.status.state, 'unavailable');
  await fixture.page.locator('#sentence-production-draft-status').scrollIntoViewIfNeeded(); await shot(fixture, 'quota-keeps-exact-visible-draft');
  fixture.observations.push({ name: 'explicit-synthetic-native-quota', fault, nativeRowsUnchanged: true, recoveryRevision: latest.revision });
  await close(fixture); await launch(fixture); await openSaved(fixture, id);
  assert.equal(await fixture.page.locator('#sentence-production-text').inputValue(), text);
  await durableDraft(fixture, id, 'production', text, { revision: latest.revision });
  const reopened = await snapshot(fixture, 'quota-recovery-acknowledged-after-new-browser-owner');
  checkDraft(reopened, id, 'listening', LISTENING, { revision: other.revision });
  unchangedExcept(before, reopened, ['sentenceDrafts']); await shot(fixture, 'quota-recovered-draft-after-close');
}, true);

async function injectRecovery(fixture, raw, label) {
  assert(fixture.fault, 'Recovery bytes may only be injected in labeled fault profiles');
  const page = fixture.page, appBefore = await readAppRecordSnapshot(page), appUi = await uiState(fixture);
  const body = '<h1 id="synthetic-sentence-recovery-fault">Explicit synthetic sentence recovery fault</h1><p>No application reducers or native record writes run on this fixture page.</p>';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Explicit sentence recovery fixture</title></head><body data-sentence-recovery-fixture="scriptless-v1">${body}</body></html>`;
  // An HTTP fixture under the app's service-worker scope is replaced by its
  // canonical index.html. A same-origin blob document has no app scripts and
  // cannot be mistaken for that navigation fallback.
  const blobUrl = await page.evaluate(html => URL.createObjectURL(new Blob([html], { type: 'text/html' })), html);
  const requests = [], startedAt = Date.now(), departingDocumentUrl = page.url();
  let fixtureCommitted = false;
  const observeNavigation = frame => { if (frame === page.mainFrame() && frame.url() === blobUrl) fixtureCommitted = true; };
  const observeRequest = request => requests.push({ url: request.url(), resourceType: request.resourceType(),
    navigation: request.isNavigationRequest(), at: Date.now(), documentUrl: request.frame().url(),
    phase: fixtureCommitted ? 'scriptless-fixture' : 'departing-app' });
  const checkFixtureRequests = () => {
    assert(fixtureCommitted, 'The main frame committed the exact scriptless fixture');
    assert(requests.every(request => request.url === blobUrl || request.phase === 'departing-app' &&
      request.documentUrl === departingDocumentUrl && request.url.startsWith(`${ORIGIN}/`)),
    'Only the departing app may finish an already-starting local request before fixture navigation commits');
    assert(requests.filter(request => request.phase === 'scriptless-fixture').every(request => request.url === blobUrl),
      'The committed scriptless fixture must not request app runtime or data');
  };
  page.on('framenavigated', observeNavigation);
  page.on('request', observeRequest);
  let before;
  try {
    await page.goto(blobUrl);
    const documentState = await page.evaluate(() => ({ url: location.href, origin: location.origin,
      contentType: document.contentType, marker: document.body.dataset.sentenceRecoveryFixture,
      body: document.body.innerHTML, document: document.documentElement.outerHTML, scripts: document.scripts.length,
      appView: document.body.dataset.view || null, ready: document.body.dataset.ready || null,
      resources: performance.getEntriesByType('resource').map(entry => ({ name: entry.name, initiatorType: entry.initiatorType })),
      bindingText: localStorage.getItem('kairo-local-record-binding-v1') }));
    const provenance = { label, startedAt, arrivedAt: Date.now(), expectedOrigin: ORIGIN, blobUrl, departingDocumentUrl, documentState,
      serializedBodySha256: sha(documentState.body), expectedSerializedBodySha256: sha(body),
      serializedDocumentSha256: sha(documentState.document), expectedSerializedDocumentSha256: sha(html.slice('<!doctype html>'.length)), requests };
    const provenanceFile = join(fixture.out, `${label}-actual-scriptless-fixture.json`);
    writeFileSync(provenanceFile, JSON.stringify(provenance, null, 2) + '\n');
    assert.equal(documentState.url, blobUrl); assert(blobUrl.startsWith(`blob:${ORIGIN}/`));
    assert.equal(documentState.origin, ORIGIN); assert.equal(documentState.contentType, 'text/html');
    assert.equal(documentState.marker, 'scriptless-v1'); assert.equal(documentState.body, body);
    assert.equal(documentState.document, html.slice('<!doctype html>'.length));
    assert.equal(documentState.scripts, 0); assert.equal(documentState.appView, null); assert.equal(documentState.ready, null);
    assert.deepEqual(documentState.resources, [], 'The actual fixture document loads no runtime resources');
    checkFixtureRequests();
    assert.equal(documentState.bindingText, appUi.recovery.installationText, 'The blob keeps the exact installation storage scope');
    before = await readAppRecordSnapshot(page); const ui = await uiState(fixture);
    assert.deepEqual(before, appBefore, 'Leaving the ready app for the scriptless fixture preserves every native row');
    assert.equal(ui.recovery.key, appUi.recovery.key); assert.equal(ui.recovery.installationText, appUi.recovery.installationText);
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: ui.recovery.key, raw });
    const after = await readAppRecordSnapshot(page), afterUi = await uiState(fixture);
    const nativeProofFile = join(fixture.out, `${label}-fixture-native-before-and-after.json`);
    writeFileSync(nativeProofFile, JSON.stringify({ before, after, recoveryBefore: ui.recovery, recoveryAfter: afterUi.recovery, requests }, null, 2) + '\n');
    assert.deepEqual(after, before, 'The explicit local recovery fixture never modifies a native row');
    assert.equal(afterUi.recovery.key, ui.recovery.key); assert.equal(afterUi.recovery.installationText, ui.recovery.installationText);
    assert.equal(afterUi.recovery.text, raw); checkFixtureRequests();
    const file = join(fixture.out, `${label}-injected-recovery-slot.txt`); writeFileSync(file, raw);
    fixture.observations.push({ name: 'explicit-synthetic-local-recovery-slot', label, path: file, sha256: sha(raw), nativeInputWrites: 0,
      fixtureProvenance: { path: provenanceFile, sha256: sha(readFileSync(provenanceFile)), serializedBodySha256: provenance.serializedBodySha256,
        origin: documentState.origin, scripts: documentState.scripts, requests, fixtureRuntimeRequests: 0,
        departingAppRequests: requests.filter(request => request.url !== blobUrl && request.phase === 'departing-app').length },
      nativeProof: { path: nativeProofFile, sha256: sha(readFileSync(nativeProofFile)) } });
  } finally { page.off('request', observeRequest); page.off('framenavigated', observeNavigation); }
  await navigate(fixture, { protectedState: true }); return before;
}
async function resolveRecovery(fixture, entryId, mode, choice) {
  const attribute = choice === 'use' ? 'data-sentence-recovery-use' : 'data-sentence-recovery-keep';
  const buttons = fixture.page.locator(`[${attribute}]`);
  const values = await buttons.evaluateAll((nodes, attribute) => nodes.map(node => JSON.parse(node.getAttribute(attribute))), attribute);
  const indexes = values.flatMap((value, index) => JSON.stringify(value) === JSON.stringify([entryId, mode]) ? [index] : []);
  assert.equal(indexes.length, 1, 'Recovery choice is bound to one exact JSON sentence tuple');
  await buttons.nth(indexes[0]).click();
}
define('synthetic-recovery-conflicts-and-unavailable-slots', async fixture => {
  const entry = await practiceFromSource(fixture), id = entry.plan.id;
  await edit(fixture, id, 'production', '  The original durable sentence draft.  ');
  await listening(fixture); const other = await edit(fixture, id, 'listening', LISTENING);
  await fixture.page.locator('#sentence-practice-back').click(); await fixture.page.locator('#sentence-production-text').waitFor();
  const candidateText = '  An older unfinished recovery candidate.\n 窓 e\u0301 🚀  ';
  await fixture.page.locator('#sentence-production-text').fill(candidateText);
  const candidateUi = await uiState(fixture), candidate = pendingRecovery(candidateUi, id, 'production').latest;
  const stale = candidateUi.recovery.text; await durableDraft(fixture, id, 'production', candidateText);
  const currentText = '  The later saved revision must stay until a choice.\n 猫 e\u0301 🚀  ';
  const current = await edit(fixture, id, 'production', currentText);
  const beforeKeep = await injectRecovery(fixture, stale, 'conflict-keep'); await openSaved(fixture, id);
  await fixture.page.waitForFunction(() => document.getElementById('sentence-production-draft-status')?.dataset.state === 'conflict');
  const conflicted = await snapshot(fixture, 'whole-conflict-before-explicit-keep');
  assert.equal(conflicted.ui.recovery.text, stale); assert.deepEqual(conflicted.rows, beforeKeep.rows);
  assert.equal(conflicted.ui.editors.production.readOnly, true); assert.equal(conflicted.ui.editors.production.saveDisabled, true);
  checkDraft(conflicted, id, 'production', currentText, { revision: current.revision });
  await fixture.page.locator('#sentence-production-draft-status').scrollIntoViewIfNeeded(); await shot(fixture, 'whole-recovered-and-saved-conflict');
  await resolveRecovery(fixture, id, 'production', 'keep');
  await durableDraft(fixture, id, 'production', currentText, { revision: current.revision });
  assert.equal(await fixture.page.locator('#sentence-production-text').inputValue(), currentText);
  unchangedExcept(beforeKeep, await snapshot(fixture, 'explicit-keep-preserves-current-tuple'));
  const beforeUse = await injectRecovery(fixture, stale, 'conflict-use'); await openSaved(fixture, id);
  await fixture.page.waitForFunction(() => document.getElementById('sentence-production-draft-status')?.dataset.state === 'conflict');
  await resolveRecovery(fixture, id, 'production', 'use');
  await durableDraft(fixture, id, 'production', candidateText);
  assert.equal(await fixture.page.locator('#sentence-production-text').inputValue(), candidateText);
  const resolved = await snapshot(fixture, 'explicit-use-only-resolves-selected-tuple');
  checkDraft(resolved, id, 'listening', LISTENING, { revision: other.revision }); unchangedExcept(beforeUse, resolved, ['sentenceDrafts']);
  fixture.observations.push({ name: 'explicit-conflict-choices', key: [id, 'production'], olderCandidateRevision: candidate.revision,
    retainedSavedRevision: current.revision, unrelatedListeningRevision: other.revision, noLearningEffects: true });
  const foreign = JSON.parse(stale); foreign.installation = 'synthetic-foreign-installation-not-a-writer-grant';
  for (const [label, raw] of [['foreign', JSON.stringify(foreign)], ['malformed', '{"version":1,"entries":[ retain these malformed bytes']]) {
    const beforeFault = await injectRecovery(fixture, raw, label); await openSaved(fixture, id);
    await fixture.page.waitForFunction(() => document.getElementById('sentence-production-draft-status')?.dataset.state === 'unavailable');
    const unavailable = await snapshot(fixture, `${label}-unavailable-and-byte-exact`);
    assert.equal(unavailable.ui.recovery.text, raw); assert.deepEqual(unavailable.rows, beforeFault.rows);
    assert.match(unavailable.ui.editors.production.status.text, /draft|recover|下書|復旧/iu);
    await fixture.page.locator('#sentence-production-draft-status').scrollIntoViewIfNeeded(); await shot(fixture, `${label}-unavailable-slot-retained`);
    await close(fixture); await launch(fixture, { protectedState: true }); await openSaved(fixture, id);
    const reopened = await snapshot(fixture, `${label}-slot-after-full-browser-restart`);
    assert.equal(reopened.ui.recovery.text, raw); assert.deepEqual(reopened.rows, beforeFault.rows);
    checkDraft(reopened, id, 'listening', LISTENING, { revision: other.revision });
  }
}, true);

async function run(definition, engine, width) {
  const out = join(OUT, `${engine}-${width}`, definition.name);
  assert(!existsSync(out), 'Each named case needs a fresh evidence/profile directory'); mkdirSync(out, { recursive: true });
  const fixture = { out, engine, width, name: definition.name, fault: definition.fault, profile: 'profile', context: null, page: null,
    episode: 0, phase: 'boot', errors: [], externalRequests: [], observations: [], snapshots: [], screenshots: [], traces: [], nativeAudio: [],
    lifecycle: [], assetLoads: [], assetWork: [] };
  const begun = Date.now(); let failure;
  try {
    await launch(fixture); await definition.body(fixture);
    assert.deepEqual(fixture.errors, []); assert.deepEqual(fixture.externalRequests, []);
  } catch (error) {
    failure = error.stack || String(error); const phase = fixture.phase;
    if (fixture.context) {
      const fault = await responseFault(fixture, { disarm: true }).catch(() => null);
      if (fault) fixture.observations.push({ name: 'response-fault-released-on-failure', ...fault });
      await clearRecordWriteFailure(fixture.page).catch(() => null);
      await shot(fixture, 'failure').catch(() => undefined);
      await snapshot(fixture, 'failure-native-record').catch(() => undefined);
    }
    fixture.phase = phase;
  } finally {
    if (fixture.context) {
      await responseFault(fixture, { disarm: true }).catch(() => null);
      await clearRecordWriteFailure(fixture.page).catch(() => null);
      await close(fixture).catch(error => { failure ||= error.stack || String(error); });
    }
    disconnected = false;
  }
  if (!failure && (fixture.errors.length || fixture.externalRequests.length)) failure = 'Unexpected application error or external request during teardown';
  const result = { name: definition.name, engine, width, passed: !failure, failure, phase: fixture.phase,
    faultCase: definition.fault, ordinaryUi: !definition.fault, elapsedMs: Date.now() - begun, browserVersion: fixture.browserVersion,
    browserLaunches: fixture.episode, profile: join(out, fixture.profile), lifecycle: fixture.lifecycle,
    observations: fixture.observations, snapshots: fixture.snapshots, screenshots: fixture.screenshots, traces: fixture.traces,
    nativeAudio: fixture.nativeAudio, errors: fixture.errors, externalRequests: fixture.externalRequests };
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n'); results.push(result);
  console.log(JSON.stringify({ engine, width, case: definition.name, passed: result.passed, failure }));
}
let integrityError;
try {
  for (const name of filters) assert(definitions.some(definition => definition.name === name), `Unknown case: ${name}`);
  writeFileSync(join(OUT, 'tested-build-identity.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(OUT, 'executed-verifier.mjs'), readFileSync(new URL(import.meta.url)));
  for (const engine of engines) for (const width of widths) for (const definition of definitions)
    if (!filters.size || filters.has(definition.name)) await run(definition, engine, width);
} finally {
  disconnected = false; server.closeAllConnections(); await new Promise(done => server.close(done));
  try { verifyFiles(); assert.equal(sha(readFileSync(new URL(import.meta.url))), verifierSha256); }
  catch (error) { integrityError = error.stack || String(error); }
  const expectedCases = engines.length * widths.length * (filters.size || definitions.length);
  const receipt = { suite: 'sentence-drafts', version: 1, startedAt, completedAt: new Date().toISOString(), site: SITE, origin: ORIGIN,
    artifactSha256: manifest.artifactSha256, sourceAssetSha256: manifest.sourceAssetSha256, verifierSha256,
    audioOutput: TEST_AUDIO_OUTPUT, audioSilenceHelperSha256,
    artifactAndVerifierUnchangedDuringRun: !integrityError, integrityError, mode: filters.size ? 'filtered' : 'full', engines, widths,
    expectedCases, passed: results.filter(row => row.passed).length, failed: results.filter(row => !row.passed).length,
    pass: !integrityError && results.length === expectedCases && results.every(row => row.passed), results,
    limitations: ['Headless persistent Chromium/WebKit profiles at the recorded viewport sizes. Actual browser close/reopen is distinct from a page reload.',
      'Ordinary cases use actual visible source/practice/export/import controls. IndexedDB and local recovery are read as output; no learner roots are seeded.',
      'Only separately named fault profiles inject native write timing/quota or exact local recovery bytes. Those controls are not ordinary-user observations.',
      'Native trusted ended events follow real recorded playback. The verifier never injects ended, changes playback rate, seeks, or substitutes a clock.',
      'Local restore uses a closed checkpoint of the same installation after one real reading-place operation. It does not exercise fresh-device enrollment or recovery.',
      'Root-authored text is test input. These checks do not establish hearing, comprehension, recording/transcript alignment, a full human journey, or learner acceptance.',
      'Only assertions reached before a recorded failure phase executed in a failing case.'] };
  writeFileSync(join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ passed: receipt.passed, failed: receipt.failed, pass: receipt.pass, receipt: join(OUT, 'receipt.json') }));
  if (!receipt.pass) process.exitCode = 1;
}
