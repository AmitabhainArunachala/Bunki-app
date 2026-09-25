/** Source-connected whole-token reading through ordinary UI and native storage.
 * Test-authored responses exercise the unreviewed annotation contract. They do
 * not establish character mastery, comprehension, or human journey acceptance.
 * Profiles begin empty; the only profile copy is a closed, ordinarily evolved
 * checkpoint of the same installation. Native record probes are read-only.
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
import { readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

assert(isAbsolute(process.env.KAIRO_SITE_DIR || ''), 'Supply an immutable, already built KAIRO_SITE_DIR');
const SITE = resolveCorridorSite(), OUT = resolveCorridorEvidence();
assert(!existsSync(join(OUT, 'receipt.json')), 'Use a fresh KAIRO_EVIDENCE_DIR');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const normalize = value => Array.isArray(value) ? value.map(normalize) : value !== null && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
const digest = value => sha(JSON.stringify(normalize(value)));
const manifest = JSON.parse(readFileSync(join(SITE, 'build-identity.json')));
const artifactFiles = new Map(manifest.files.map(file => [file.path, file.sha256]));
const verifyFiles = () => {
  assert.equal(sha(JSON.stringify(manifest.files)), manifest.artifactSha256);
  for (const file of manifest.files) assert.equal(sha(readFileSync(join(SITE, file.path))), file.sha256, file.path);
};
verifyFiles();
const verifierSha256 = sha(readFileSync(new URL(import.meta.url)));
const helperFiles = ['browser-audio-silence.mjs', 'record-test-support.mjs'];
const helperSha256 = Object.fromEntries(helperFiles.map(file => [file, sha(readFileSync(new URL(file, import.meta.url)))]));
const requiredAssets = ['corridor.js', 'corridor.css', 'sentence-practice.mjs', 'teacher-context.mjs', 'modules/learning-core.mjs'];
for (const path of requiredAssets) assert(artifactFiles.has(path), `Candidate omits ${path}`);
const engines = !process.env.KAIRO_BROWSER || process.env.KAIRO_BROWSER === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER];
assert(engines.every(engine => ['chromium', 'webkit'].includes(engine)), 'KAIRO_BROWSER must be chromium, webkit or all');
const viewportFilter = process.env.KAIRO_KANJI_VIEWPORT || 'all';
assert(['all', 'desktop', 'phone'].includes(viewportFilter), 'KAIRO_KANJI_VIEWPORT must be desktop, phone or all');
const filters = new Set(process.argv.filter(arg => arg.startsWith('--case=')).map(arg => arg.slice(7)));
assert(process.argv.slice(2).every(arg => arg.startsWith('--case=')), 'Only --case=<name> arguments are supported');
const definitions = [
  { name: 'ordinary-n5-station-reading', id: 'bunki-graded-n5-station', title: '駅で待つ時間', level: 'N5',
    index: 6, start: 0, end: 12, quote: '朝、私は駅で電車を待ちました。',
    token: { s: '電車', b: '電車', r: 'でんしゃ' }, focus: '車', wrong: 'くるま', controls: true,
    widths: { chromium: 390, webkit: 1440 } },
  { name: 'ordinary-n3-river-reading', id: 'bunki-graded-n3-river', title: '川沿いの道', level: 'N3',
    index: 50, start: 45, end: 57, quote: '川沿いには、季節の変化がはっきり出る。',
    token: { s: '季節', b: '季節', r: 'きせつ' }, focus: '節', answer: '  キセツ\n',
    widths: { chromium: 1440, webkit: 390 } },
  { name: 'ordinary-n1-city-reading', id: 'bunki-essay-n1-city', title: '都市の匿名性と言語', level: 'N1',
    index: 42, start: 41, end: 58, quote: 'この匿名性は、外国語話者にとって特別な意味を持つ。',
    token: { s: '匿名', b: '匿名', r: 'とくめい' }, focus: '匿',
    widths: { chromium: 390, webkit: 1440 } },
];
for (const name of filters) assert(definitions.some(row => row.name === name), `Unknown case: ${name}`);
const selected = engines.flatMap(engine => definitions.filter(row => !filters.size || filters.has(row.name))
  .map(source => ({ source, engine, width: source.widths[engine] })))
  .filter(row => viewportFilter === 'all' || row.width === (viewportFilter === 'phone' ? 390 : 1440));
assert(selected.length > 0, 'The supplied filters select no assigned case/engine/viewport combination');
const results = [], startedAt = new Date().toISOString();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.m4a': 'audio/mp4' };
const privateKey = join(OUT, 'synthetic-localhost-key.pem'), certificate = join(OUT, 'synthetic-localhost-cert.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', privateKey, '-out', certificate,
  '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
let disconnected = false, activeContexts = 0;
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

function sourceFacts(source) {
  const path = `data/articles/${source.id}.json`, bytes = readFileSync(join(SITE, path));
  assert.equal(sha(bytes), artifactFiles.get(path));
  const passage = JSON.parse(bytes), surfaces = passage.tokens.map(token => token.s);
  assert.equal(passage.id, source.id); assert.equal(passage.title, source.title); assert.equal(passage.authorLevel, source.level);
  assert.equal(passage.rubySource, 'tokenizer'); assert.equal(passage.tokens[source.index].c, true);
  for (const key of ['s', 'b', 'r']) assert.equal(passage.tokens[source.index][key], source.token[key]);
  assert.equal(surfaces.slice(source.start, source.end).join(''), source.quote);
  const words = JSON.parse(readFileSync(join(SITE, 'data/share_alike/words.json'))).words;
  const kanji = JSON.parse(readFileSync(join(SITE, 'data/share_alike/kanji.json'))).kanji;
  assert(words[source.token.b] && kanji[source.focus], 'The real corpus token and focus have dictionary entries');
  return { path, passage, surfaces, sha256: sha(bytes), dictionary: { word: source.token.b, kanji: source.focus } };
}
function expectedContext(fixture, kind) {
  const { source, facts } = fixture;
  const context = { version: 1, sourceKind: 'bundled-passage', sourceId: source.id,
    sourceDigest: sha(JSON.stringify(facts.surfaces)), unit: 'token-index', start: source.start, end: source.end,
    index: source.index, quote: source.quote, title: source.title,
    attribution: facts.passage.attribution || facts.passage.sourceLabel || '', url: facts.passage.url || null,
    target: kind === 'kanji-reading' ? { type: 'kanji', id: source.focus } : { type: 'word', id: source.token.b } };
  return { ...context, id: `teacher-context:${digest(context)}` };
}
function expectedOrigin(fixture, context) {
  const { source, facts } = fixture, surfaces = facts.surfaces.slice(source.start, source.end);
  const start = surfaces.slice(0, source.index - source.start).join('').length;
  return { contextRef: context.id, sourceId: source.id, sourceDigest: context.sourceDigest, text: source.quote,
    tokenSpan: { unit: 'token-index', start: source.start, end: source.end, index: source.index, surfaces },
    start, end: start + source.token.s.length, title: source.title, attribution: context.attribution };
}
function authorityUnchanged(before, after) {
  assert.deepEqual(after.archive, before.archive, 'These actions preserve the entire archive');
  assert.deepEqual(after.installation, before.installation, 'These actions cannot replace installation authority');
  for (const kind of ['actor', 'operation', 'outbox']) assert.deepEqual(after.rows.filter(row => row.kind === kind),
    before.rows.filter(row => row.kind === kind), `${kind} rows and exact native bytes remain unchanged`);
}
function unchangedExcept(before, after, allowed = []) {
  for (const key of new Set([...Object.keys(before.record), ...Object.keys(after.record)]))
    if (!allowed.includes(key)) assert.deepEqual(after.record[key], before.record[key], `Unexpected learner root change: ${key}`);
  authorityUnchanged(before, after);
}
function retained(before, after) {
  unchangedExcept(before, after); assert.equal(after.revision, before.revision, 'Read-only navigation/restart preserves the learner revision');
}
async function ready(fixture) {
  await fixture.page.waitForFunction(() => document.body?.dataset.ready === '1', null, { timeout: 30000 });
  assert.equal(await fixture.page.locator('#store-alert').isVisible(), false);
  assert.equal(await fixture.page.evaluate(() => globalThis[Symbol.for('kairo.test.silent-audio.v1')] === true), true,
    'The shared silence helper is installed in the actual document before app navigation');
}
async function attestRuntime(fixture, start, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && requiredAssets.some(path => !fixture.assetLoads.slice(start).some(row => row.path === path))) await delay(25);
  const assets = fixture.assetLoads.slice(start);
  for (const path of requiredAssets) assert(assets.some(row => row.path === path), `Actual document did not load ${path}`);
  assert(assets.every(row => row.sha256 === artifactFiles.get(row.path)), 'Actual loaded bytes differ from the frozen candidate');
  fixture.observations.push({ name: 'actual-loaded-runtime', label, episode: fixture.episode, assets,
    audioOutput: TEST_AUDIO_OUTPUT, audioSilenceHelperSha256: helperSha256['browser-audio-silence.mjs'], silenceMarker: true });
}
async function launch(fixture, { offline = false } = {}) {
  assert.equal(activeContexts, 0, 'This verifier opens only one context at a time'); assert.equal(fixture.context, null);
  fixture.episode += 1;
  fixture.context = await ({ chromium, webkit }[fixture.engine]).launchPersistentContext(join(fixture.out, fixture.profile), {
    headless: true, viewport: { width: fixture.width, height: fixture.width === 390 ? 844 : 1050 }, locale: 'en-US',
    serviceWorkers: 'allow', acceptDownloads: true, ignoreHTTPSErrors: true,
    ...(fixture.engine === 'chromium' ? { args: ['--ignore-certificate-errors'] } : {}),
  });
  activeContexts += 1; fixture.browserVersion = fixture.context.browser()?.version();
  fixture.lifecycle.push({ action: 'launch', episode: fixture.episode, profile: fixture.profile, offline, at: new Date().toISOString() });
  await silenceBrowserAudio(fixture.context);
  await fixture.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  fixture.traceActive = true;
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
  fixture.page = fixture.context.pages()[0] || await fixture.context.newPage(); fixture.page.setDefaultTimeout(15000);
  fixture.page.on('pageerror', error => fixture.errors.push({ episode: fixture.episode, phase: fixture.phase,
    message: error.message, stack: error.stack, url: fixture.page.url(), at: new Date().toISOString() }));
  fixture.page.on('request', request => {
    if (/\.(?:m4a|mp3|wav|ogg|aac)(?:\?|$)/u.test(request.url())) fixture.audioRequests.push({ episode: fixture.episode, url: request.url() });
  });
  fixture.page.on('response', response => {
    const path = new URL(response.url()).pathname.slice(1);
    if (!artifactFiles.has(path) || !(/\.(?:js|mjs|css)$/u.test(path) || path === fixture.facts.path)) return;
    const work = response.body().then(bytes => fixture.assetLoads.push({ path, sha256: sha(bytes),
      episode: fixture.episode, fromServiceWorker: response.fromServiceWorker() }));
    fixture.assetWork.push(work); void work.catch(() => undefined);
  });
  const start = fixture.assetLoads.length;
  await fixture.page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(fixture); await attestRuntime(fixture, start, offline ? 'offline-full-restart' : 'front-door');
}
async function close(fixture) {
  if (!fixture.context) return;
  const context = fixture.context, lifecycle = { action: 'full-browser-close', episode: fixture.episode,
    profile: fixture.profile, startedAt: new Date().toISOString(), contextClosed: false };
  try {
    const pages = context.pages(), keeper = await context.newPage(); await keeper.goto('about:blank');
    await Promise.all(pages.map(page => page.close()));
    // Actual client departure permits worker activation before process close.
    // No application, scheduler, playback or browser clock is substituted.
    await delay(1000);
    if (fixture.traceActive) {
      const file = join(fixture.out, `trace-${fixture.episode}.zip`);
      await context.tracing.stop({ path: file }); fixture.traceActive = false;
      fixture.traces.push({ episode: fixture.episode, path: file, sha256: sha(readFileSync(file)) });
    }
  } finally {
    try { await context.close(); lifecycle.contextClosed = true; }
    finally {
      if (lifecycle.contextClosed) { activeContexts -= 1; fixture.context = null; }
      lifecycle.completedAt = new Date().toISOString(); fixture.lifecycle.push(lifecycle);
    }
  }
  await Promise.all(fixture.assetWork); fixture.assetWork = [];
}
async function uiState(fixture) {
  return fixture.page.evaluate(() => ({ view: document.body?.dataset.view, focusedId: document.activeElement?.id || null,
    sheet: document.getElementById('sheet')?.dataset.node ?? null,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    silenceMarker: globalThis[Symbol.for('kairo.test.silent-audio.v1')] === true,
    speech: { speaking: globalThis.speechSynthesis?.speaking ?? false, pending: globalThis.speechSynthesis?.pending ?? false },
    playingMedia: [...document.querySelectorAll('audio,video')].filter(node => !node.paused).length,
    practiceStatus: document.getElementById('sentence-practice-status')?.textContent ?? null,
    recallStatus: document.getElementById('kanji-reading-review-status')?.textContent ?? null,
    answer: document.getElementById('sentence-recall-answer')?.value ?? null,
    sourceDisclosureOpen: document.querySelector('.learning-source')?.open ?? null,
    sourceReturnClick: window.__kanjiPracticeSourceReturnClick || null,
    session: window.__KAIRO_SRS__?.session() ?? null }));
}
async function snapshot(fixture, label) {
  fixture.phase = label;
  const state = await readAppRecordSnapshot(fixture.page), ui = await uiState(fixture);
  for (const row of state.rows) assert.equal(sha(row.text), row.sha256);
  const file = join(fixture.out, `${label}.json`); writeFileSync(file, JSON.stringify({ ...state, ui }, null, 2) + '\n');
  fixture.snapshots.push({ label, path: file, sha256: sha(readFileSync(file)), revision: state.revision });
  return state;
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
  const ui = await uiState(fixture), uiFile = join(fixture.out, `${stem}-ui.json`);
  writeFileSync(uiFile, JSON.stringify(ui, null, 2) + '\n');
  fixture.screenshots.push({ label, path: file, sha256: sha(readFileSync(file)), ui: uiFile });
  assert.equal(ui.overflow, false, 'The actual viewport has no horizontal overflow');
  assert.equal(ui.silenceMarker, true); assert.equal(ui.playingMedia, 0); assert.deepEqual(ui.speech, { speaking: false, pending: false });
}
async function shelf(fixture) {
  const page = fixture.page;
  for (let step = 0; step < 16; step++) {
    if (await page.locator('#sheet').count()) { await page.locator('#sheet-back').click(); continue; }
    const view = await page.locator('body').getAttribute('data-view'); if (view === 'shelf') return;
    if (view === 'drift') {
      await page.locator('#ginga-symbol').focus(); await page.keyboard.press('Enter'); await page.locator('.bubble-shelf').click();
    } else if (view === 'review') {
      if (await page.locator('.review-summary').count()) await page.locator('.close-doors .take').click();
      else await page.locator('#zen-exit').click();
    } else if (view === 'sentence-practice') await page.locator('#sentence-practice-back').click();
    else await page.locator('#back').click();
    await page.waitForFunction(previous => document.body.dataset.view !== previous, view);
  }
  assert.fail('Ordinary Back controls did not reach the bookshelf');
}
async function tray(fixture) { await shelf(fixture); await fixture.page.locator('#tray').click(); }
async function focusedInViewport(page, id) {
  await page.waitForFunction(id => {
    const node = document.getElementById(id); if (!node || document.activeElement !== node) return false;
    const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.top >= 0 && box.bottom <= innerHeight;
  }, id);
}
async function atSource(fixture, { focus = false } = {}) {
  const { page, source } = fixture;
  await page.locator(`#reader .tok[data-index="${source.index}"][data-word="${source.token.b}"]`).waitFor();
  assert.equal(await page.locator('h1.view-title').textContent(), source.title);
  const visible = await page.locator('#reader .tok').evaluateAll(nodes => nodes.map(node => {
    const clone = node.cloneNode(true); clone.querySelectorAll('rt,.tok-en').forEach(part => part.remove()); return clone.textContent;
  }));
  assert.deepEqual(visible, fixture.facts.surfaces, 'Actual reader preserves every source token surface and ordering');
  if (focus) {
    await page.waitForFunction(index => document.activeElement?.matches(`#reader .tok[data-index="${index}"]`), source.index);
    assert(await page.locator(`#reader .tok[data-index="${source.index}"]`).evaluate(node => {
      const box = node.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight;
    }), 'The exact source token is focused in the viewport');
  }
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && !fixture.assetLoads.some(row => row.path === fixture.facts.path && row.episode === fixture.episode)) await delay(25);
  assert(fixture.assetLoads.some(row => row.path === fixture.facts.path && row.episode === fixture.episode && row.sha256 === fixture.facts.sha256),
    'The actual current source file matches the frozen full bytes, including token b/r/c and rubySource');
}
async function openSource(fixture) {
  await shelf(fixture); await fixture.page.locator(`[data-passage="${fixture.source.id}"] .shelf-open`).click(); await atSource(fixture);
}
async function openWord(fixture) {
  // The existing focus alternatives suppress the token's own pointer focus
  // for 900ms. Wait in real time before the native baseline so that guard
  // expires and the preceding reader bookmark debounce can settle.
  await delay(950);
  const { page, source } = fixture, before = await readAppRecordSnapshot(page), earliest = Date.now();
  const token = page.locator(`#reader .tok[data-index="${source.index}"]`); await token.focus();
  await token.locator('..').locator('[data-action="entry.open"][data-target-kind="word"]').click();
  await page.locator(`#sheet[data-node="word:${source.token.b}"]`).waitFor();
  await waitForAppRecord(page, record => record.obslog.length === before.record.obslog.length + 1);
  const after = await snapshot(fixture, `word-drawer-${++fixture.wordVisits}`), row = after.record.obslog.at(-1);
  assert.deepEqual(row.slice(1), ['tap', `word:${source.token.b}`, 3, source.id]);
  assert(Number.isSafeInteger(row[0]) && row[0] >= earliest && row[0] <= Date.now());
  assert.deepEqual(after.record.obslog, [...before.record.obslog, row]);
  unchangedExcept(before, after, ['obslog']);
  return after;
}
function checkEntry(fixture, entry, kind, sibling = null) {
  const context = expectedContext(fixture, kind), origin = expectedOrigin(fixture, context), { source } = fixture;
  assert.deepEqual(entry.context, context); assert.deepEqual(entry.plan.origin, origin);
  assert.equal(entry.plan.capture.threadId, `thread:source-practice:${encodeURIComponent(source.token.s)}`);
  assert.equal(entry.plan.confirmation.threadId, entry.plan.capture.threadId);
  assert.equal(entry.plan.capture.sourceRef.locator, `${context.id}#token=${source.index};sentence-utf16=${origin.start},${origin.end}`);
  assert.deepEqual(entry.plan.capture.provenance, { source: source.id, sourceVersion: context.sourceDigest,
    license: 'unverified', attribution: context.attribution, modificationStatus: 'unmodified', reviewStatus: 'unreviewed' });
  assert.equal(entry.plan.contracts.length, 1);
  const contract = entry.plan.contracts[0];
  if (kind === 'cloze') {
    assert.equal(entry.plan.version, 1); assert.equal(Object.hasOwn(entry.plan, 'kind'), false);
    assert.equal(entry.plan.id, `source-practice:${context.id}:${origin.start}:${origin.end}:v1`);
    assert.equal(contract.skill, 'discrimination'); assert.equal(contract.contractId, `${entry.plan.id}:cloze`);
    return;
  }
  const cue = { version: 1, focusKanji: source.focus, token: source.token, rubySource: 'tokenizer', reviewStatus: 'unreviewed' };
  assert.deepEqual(Object.keys(entry.plan).sort(), ['version', 'kind', 'id', 'origin', 'readingCue', 'capture', 'confirmation', 'contracts'].sort());
  assert.equal(entry.plan.version, 2); assert.equal(entry.plan.kind, 'kanji-reading'); assert.deepEqual(entry.plan.readingCue, cue);
  const tuple = JSON.stringify([1, source.focus, source.token.s, source.token.b, source.token.r, 'tokenizer', 'unreviewed']);
  assert.equal(entry.plan.id, `source-kanji-reading:${context.id}:${origin.start}:${origin.end}:v1:${encodeURIComponent(tuple)}`);
  assert.equal(contract.type, 'ContractCreated'); assert.equal(contract.contractId, `${entry.plan.id}:kanji-reading`);
  assert.equal(contract.contractVersion, 1); assert.equal(contract.targetComponentId, `kc:${source.token.s}`);
  assert.equal(contract.skill, 'orthography_to_reading'); assert.equal(contract.cueModality, 'text'); assert.equal(contract.responseModality, 'text');
  assert.deepEqual(contract.acceptedAnswers, [source.token.r]); assert.deepEqual(contract.hintPolicy, { hintsAllowed: false, maxHints: 0 });
  assert.deepEqual(contract.revealPolicy, { revealAllowed: true, revealIsRecorded: true });
  assert.equal(contract.promptFamilyVersion, 'source-token-reading-nfc-kana-fold@1');
  assert(sibling); assert.deepEqual(entry.plan.confirmation, sibling.plan.confirmation);
  assert.notEqual(entry.plan.id, sibling.plan.id); assert.notEqual(contract.contractId, sibling.plan.contracts[0].contractId);
}
async function confirm(fixture, kind, sibling = null) {
  const before = await readAppRecordSnapshot(fixture.page), earliest = Date.now();
  await fixture.page.locator(kind === 'cloze' ? '#sentence-practice-confirm' : '#kanji-reading-confirm').click();
  await fixture.page.locator('#sentence-review-start').waitFor();
  const after = await snapshot(fixture, `${kind}-explicit-enrollment`);
  const priorRoot = before.record.sentencePractice || { version: 1, entries: [], responses: [], grades: [] };
  const entry = after.record.sentencePractice.entries.at(-1); checkEntry(fixture, entry, kind, sibling);
  assert.deepEqual(after.record.sentencePractice, { ...priorRoot, entries: [...priorRoot.entries, entry] });
  const contextRoot = before.record.teacherContexts || { version: 1, activeRef: null, entries: [] };
  assert.deepEqual(after.record.teacherContexts, { ...contextRoot, entries: [...contextRoot.entries, entry.context] });
  const at = Date.parse(entry.plan.capture.occurredAt); assert(at >= earliest && at <= Date.now());
  assert.deepEqual(after.record.taken, [...before.record.taken, { t: 'sentence', id: entry.plan.id, label: fixture.source.quote,
    kind: kind === 'cloze' ? '文の穴埋め' : '文中の語の読み', kindEn: kind === 'cloze' ? 'sentence cloze' : 'word reading in context',
    ts: at, started: at, sourceContextRef: entry.context.id }]);
  unchangedExcept(before, after, ['sentencePractice', 'teacherContexts', 'taken']);
  assert.equal(after.revision, before.revision + 1);
  fixture.observations.push({ name: 'explicit-enrollment-only', kind, entryId: entry.plan.id, sourceContext: entry.context,
    scheduleUnchanged: true, responsesUnchanged: true, archiveAndAuthorityUnchanged: true });
  return { entry, state: after };
}
async function openSaved(fixture, entry) {
  await tray(fixture); const page = fixture.page;
  if (!await page.locator('#sentence-practice-library').evaluate(node => node.open)) await page.locator('#sentence-practice-library summary').click();
  const button = page.locator('[data-sentence-practice-id]').filter({ hasText: fixture.source.quote });
  const exact = page.locator(`[data-sentence-practice-id="${entry.plan.id}"]`);
  assert(await button.count() > 0); assert.equal(await exact.count(), 1); await exact.click();
  await page.locator('#sentence-review-start').waitFor(); assert.equal(await page.locator('.sentence-original').textContent(), fixture.source.quote);
}
async function startReview(fixture, entry) {
  const before = await readAppRecordSnapshot(fixture.page);
  await fixture.page.locator('#sentence-review-start').click(); await fixture.page.locator('#sentence-recall-answer').waitFor();
  assert.deepEqual(await fixture.page.evaluate(() => window.__KAIRO_SRS__.session()), { queue: 1, ix: 0, deferred: 0 });
  const { origin } = entry.plan;
  assert.equal(await fixture.page.locator('.sentence-recall-cue').textContent(), entry.plan.kind === 'kanji-reading'
    ? origin.text : `${origin.text.slice(0, origin.start)}［ … ］${origin.text.slice(origin.end)}`);
  if (entry.plan.kind === 'kanji-reading') {
    assert.equal(await fixture.page.locator('.sentence-recall .sentence-answer').textContent(), fixture.source.token.s);
    assert.equal(await fixture.page.locator('.sentence-recall .sentence-response-text').count(), 0, 'Supplied kana is hidden before checking or revealing');
    assert.match(await fixture.page.locator('.sentence-recall').innerText(), /whole word[\s\S]*unreviewed/u);
  }
  assert.equal(await fixture.page.locator('#sentence-recall-check').isDisabled(), true);
  retained(before, await readAppRecordSnapshot(fixture.page));
}
async function answer(fixture, entry, text, { revealed = false, mustRepeat = false, label } = {}) {
  const page = fixture.page, before = await readAppRecordSnapshot(page);
  await page.locator('#sentence-recall-answer').fill(text);
  assert.equal(await page.locator('#sentence-recall-answer').inputValue(), text);
  retained(before, await readAppRecordSnapshot(page));
  const earliest = Date.now(); await page.locator(revealed ? '#sentence-recall-reveal' : '#sentence-recall-check').click();
  await page.locator(mustRepeat ? '.grade.g-again' : '.grade.g-easy').waitFor();
  if (mustRepeat) assert.equal(await page.locator('.grade').count(), 1, 'Wrong or revealed recall offers only Again');
  else assert.equal(await page.locator('.grade').count(), 4);
  const after = await snapshot(fixture, `${label}-response-before-grade`), response = after.record.sentencePractice.responses.at(-1);
  assert.deepEqual(Object.keys(response).sort(), ['id', 'entryId', 'mode', 'at', 'text', 'revealed', 'latencyMs', 'observation'].sort());
  assert.match(response.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  assert.equal(response.entryId, entry.plan.id); assert.equal(response.mode, entry.plan.kind === 'kanji-reading' ? 'kanji-reading' : 'cloze');
  assert.equal(response.text, text); assert.equal(response.revealed, revealed); assert.equal(response.observation, null);
  assert(Number.isSafeInteger(response.latencyMs) && response.latencyMs >= 0);
  assert(Date.parse(response.at) >= earliest && Date.parse(response.at) <= Date.now());
  assert.deepEqual(after.record.sentencePractice, { ...before.record.sentencePractice,
    responses: [...before.record.sentencePractice.responses, response] });
  unchangedExcept(before, after, ['sentencePractice']); assert.equal(after.revision, before.revision + 1);
  if (entry.plan.kind === 'kanji-reading') assert.equal(await page.locator('.sentence-recall .sentence-response-text').first().textContent(), fixture.source.token.r);
  return { state: after, response };
}
function siblingUnchanged(fixture, before, after) {
  const id = fixture.siblingId; if (!id) return;
  assert.deepEqual(after.record.srs[`sentence:${id}`], before.record.srs[`sentence:${id}`]);
  assert.deepEqual(after.record.revlog.filter(row => row[1] === `sentence:${id}`), before.record.revlog.filter(row => row[1] === `sentence:${id}`));
  for (const key of ['entries', 'responses', 'grades']) {
    const relevant = state => state.record.sentencePractice[key].filter(row => key === 'entries' ? row.plan.id === id
      : key === 'responses' ? row.entryId === id : state.record.sentencePractice.responses.some(response => response.id === row.responseId && response.entryId === id));
    assert.deepEqual(relevant(after), relevant(before), `Reading leaves the cloze sibling's exact ${key} unchanged`);
  }
}
async function grade(fixture, entry, response, chosen, label) {
  const page = fixture.page, before = await readAppRecordSnapshot(page), earliest = Date.now(), key = `sentence:${entry.plan.id}`;
  await page.locator(`.grade.g-${chosen}`).click();
  await page.locator(chosen === 'again' ? '#zen-wait-skip' : '.review-summary').waitFor();
  const after = await snapshot(fixture, `${label}-graded`), observed = after.record.sentencePractice.grades.at(-1), event = observed.observation;
  assert.equal(observed.responseId, response.id); assert.equal(observed.revlogIndex, before.record.revlog.length);
  assert.equal(event.type, 'ReviewGraded'); assert.equal(event.contractId, entry.plan.contracts[0].contractId);
  assert.equal(event.grade, chosen); assert.equal(event.hintsUsed, 0); assert.equal(event.latencyMs, response.latencyMs);
  assert.equal(event.revealedBeforeRecall, response.revealed); assert.equal(event.probeContext, 'standalone');
  assert.equal(event.userConfirmedEasy, chosen === 'easy' ? true : undefined);
  assert.equal(event.idempotencyKey, `${response.id}:grade`);
  assert.deepEqual(after.record.sentencePractice, { ...before.record.sentencePractice,
    grades: [...before.record.sentencePractice.grades, observed] });
  const row = after.record.revlog.at(-1), card = after.record.srs[key], prior = before.record.srs[key];
  assert.equal(row.length, 12); assert(row[0] >= earliest && row[0] <= Date.now());
  assert.equal(row[0], Date.parse(event.occurredAt)); assert.equal(row[1], key); assert.equal(row[2], { again: 1, hard: 2, good: 3, easy: 4 }[chosen]);
  assert.equal(row[3], prior?.state || 0); assert.equal(row[10], card.scheduled_days); assert.equal(row[11], Date.parse(card.due));
  assert.equal(card.reps, (prior?.reps || 0) + 1); assert.equal(card.last_review, event.occurredAt);
  assert.deepEqual(after.record.revlog, [...before.record.revlog, row]);
  assert.deepEqual(after.record.srs, { ...before.record.srs, [key]: card });
  const day = await page.evaluate(at => { const date = new Date(at), pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }, row[0]);
  const daily = { ...(before.record.stats[day] || { n: 0, again: 0 }) };
  daily.n = (daily.n || 0) + 1; if (!prior) daily.nnew = (daily.nnew || 0) + 1;
  if (chosen === 'again') daily.again = (daily.again || 0) + 1;
  assert.deepEqual(after.record.stats, { ...before.record.stats, [day]: daily });
  unchangedExcept(before, after, ['sentencePractice', 'srs', 'revlog', 'stats']); assert.equal(after.revision, before.revision + 1);
  siblingUnchanged(fixture, before, after);
  fixture.observations.push({ name: 'exact-response-grade-schedule-binding', entryId: entry.plan.id, responseId: response.id,
    contractId: event.contractId, grade: chosen, revlogIndex: observed.revlogIndex, schedulerKey: key, day,
    clozeSiblingUnchanged: !!fixture.siblingId, rootAuthoredInput: true });
  return { before, after, day, key, chosen, observed };
}
async function undo(fixture, graded, label) {
  const page = fixture.page, before = await readAppRecordSnapshot(page), earliest = Date.now();
  await page.locator('.review-undo').click(); await page.locator('#sentence-recall-answer').waitFor();
  await waitForAppRecord(page, record => record.revlog.length === before.record.revlog.length + 1);
  const after = await snapshot(fixture, `${label}-undone`), row = after.record.revlog.at(-1);
  assert(row[0] >= earliest && row[0] <= Date.now()); assert.deepEqual(row.slice(1), [graded.key, 0, graded.observed.revlogIndex]);
  assert.deepEqual(after.record.revlog, [...before.record.revlog, row]);
  assert.deepEqual(after.record.srs, graded.before.record.srs, 'Undo restores the exact prior entire schedule map');
  assert.deepEqual(after.record.sentencePractice, before.record.sentencePractice, 'Undo retains the response and grade history');
  const daily = { ...before.record.stats[graded.day], n: before.record.stats[graded.day].n - 1 };
  if (graded.chosen === 'again') daily.again = before.record.stats[graded.day].again - 1;
  if (!graded.before.record.srs[graded.key] && daily.nnew) daily.nnew -= 1;
  assert.deepEqual(after.record.stats, { ...before.record.stats, [graded.day]: daily });
  unchangedExcept(before, after, ['srs', 'revlog', 'stats']); assert.equal(after.revision, before.revision + 1);
  assert.equal(await page.locator('#sentence-recall-answer').inputValue(), ''); siblingUnchanged(fixture, before, after);
  fixture.observations.push({ name: 'append-only-undo', gradeIndex: graded.observed.revlogIndex, undoIndex: after.record.revlog.length - 1,
    schedulerKey: graded.key, exactPreviousSchedules: true, responseAndGradeRetained: true });
}
async function sourceDetour(fixture, { review = false, label } = {}) {
  const page = fixture.page, caller = review ? 'review-source-return' : 'learning-source-return', before = await readAppRecordSnapshot(page);
  if (!review && !await page.locator('.learning-source').evaluate(node => node.open)) await page.locator('.learning-source summary').click();
  await page.locator(`#${caller}`).click(); await atSource(fixture, { focus: true });
  await shot(fixture, `${label}-exact-source`);
  await page.locator('#reader-source-back').evaluate(node => {
    window.__kanjiPracticeSourceReturnClick = null;
    node.addEventListener('click', event => { window.__kanjiPracticeSourceReturnClick = {
      scroll: Math.round(window.scrollY), trusted: event.isTrusted, at: performance.now() }; }, { capture: true, once: true });
  });
  await page.locator('#reader-source-back').click(); await page.locator(`#${caller}`).waitFor(); await focusedInViewport(page, caller);
  const clicked = await page.evaluate(() => window.__kanjiPracticeSourceReturnClick), after = await snapshot(fixture, `${label}-source-return`);
  assert.equal(clicked?.trusted, true); assert.deepEqual(after.record.readerPos, { ...before.record.readerPos, [fixture.source.id]: clicked.scroll });
  unchangedExcept(before, after, ['readerPos']); siblingUnchanged(fixture, before, after);
  fixture.observations.push({ name: 'exact-source-and-caller-return', label, caller, sourceId: fixture.source.id,
    tokenIndex: fixture.source.index, actualSourceSha256: fixture.facts.sha256, click: clicked, callerFocusedInViewport: true });
  return after;
}
async function history(fixture, entry, baseline) {
  const page = fixture.page; await openSaved(fixture, entry);
  const expected = baseline.record.sentencePractice.responses.filter(row => row.entryId === entry.plan.id).slice(-10).reverse();
  const rows = page.locator('#sentence-practice-history .sentence-response-row'); assert.equal(await rows.count(), expected.length);
  for (let index = 0; index < expected.length; index++) {
    const response = expected[index], row = rows.nth(index); assert.equal(await row.getAttribute('data-response-id'), response.id);
    assert.equal(await row.locator('.sentence-response-text').textContent(), response.text || 'No response');
    const observed = baseline.record.sentencePractice.grades.find(value => value.responseId === response.id);
    const undone = baseline.record.revlog.some(value => value[2] === 0 && value[3] === observed.revlogIndex);
    assert((await row.innerText()).includes(undone ? 'Review grade undone' : `This reading review: ${observed.observation.grade}`));
  }
  retained(baseline, await readAppRecordSnapshot(page));
}
async function exportUi(fixture) {
  await tray(fixture); const before = await readAppRecordSnapshot(fixture.page), earliest = Date.now();
  const pending = fixture.page.waitForEvent('download'); await fixture.page.locator('#export-store').click();
  const file = join(fixture.out, 'ordinary-ui-backup.json'); await (await pending).saveAs(file); const backup = JSON.parse(readFileSync(file));
  assert.equal(backup.format, 'kairo-backup'); assert.equal(backup.version, 2); assert.equal(backup.completeness, 'complete');
  for (const root of ['record', 'archive', 'journal']) assert.equal(backup.sha256[root], digest(backup[root]));
  assert.deepEqual(backup.record, before.record); assert.deepEqual(backup.archive, before.archive);
  assert(backup.journal, 'A real existing reading.resume operation is exported with its installation journal');
  await waitForAppRecord(fixture.page, record => record.stats.lastExportTs >= earliest);
  const after = await snapshot(fixture, 'ordinary-export-metadata'), timestamp = after.record.stats.lastExportTs;
  assert(Number.isSafeInteger(timestamp) && timestamp >= earliest && timestamp <= Date.now());
  assert.deepEqual(after.record, { ...before.record, stats: { ...before.record.stats, lastExportTs: timestamp } });
  unchangedExcept(before, after, ['stats']); assert.equal(after.revision, before.revision + 1);
  fixture.observations.push({ name: 'actual-ui-export', file, sha256: sha(readFileSync(file)), version: backup.version,
    completeExactRecordAndArchive: true, onlyExportTimestampChanged: true });
  return { before, after, file, backup };
}
async function importUi(fixture, file) {
  await tray(fixture); const page = fixture.page, timeOrigin = await page.evaluate(() => performance.timeOrigin), start = fixture.assetLoads.length;
  await page.locator('#import-file').setInputFiles(file);
  await page.waitForFunction(prior => performance.timeOrigin !== prior && document.body.dataset.ready === '1', timeOrigin, { timeout: 30000 });
  await ready(fixture); await attestRuntime(fixture, start, 'actual-ui-import-reload');
}

async function ordinary(fixture) {
  const { page, source } = fixture;
  await openSource(fixture);
  const sourceBefore = await readAppRecordSnapshot(page), tapStarted = Date.now();
  await page.locator(`#reader .tok[data-index="${source.index}"]`).click();
  await waitForAppRecord(page, record => record.obslog.length === sourceBefore.record.obslog.length + 1);
  const tapped = await readAppRecordSnapshot(page), tap = tapped.record.obslog.at(-1);
  assert(tap[0] >= tapStarted && tap[0] <= Date.now());
  assert.deepEqual(tap.slice(1), ['tap', `word:${source.token.b}`, 1, source.id]);
  assert.deepEqual(tapped.record.obslog, [...sourceBefore.record.obslog, tap]); unchangedExcept(sourceBefore, tapped, ['obslog']);
  await page.locator('#reader-place-save').click();
  await page.waitForFunction(() => document.getElementById('reader-place-note')?.textContent.includes('is saved'));
  const savedPlace = await snapshot(fixture, 'ordinary-reading-place');
  assert.equal(savedPlace.rows.filter(row => row.kind === 'operation').length, 1,
    'One actual reading-place save supplies the already allocated actor sequence for local checkpoint restore');
  const word = await openWord(fixture);
  await page.locator('#entry-sentence-practice').click(); await page.locator('#sentence-practice-confirm').waitFor();
  assert.equal(await page.locator('#sentence-choose-cloze').isChecked(), true);
  assert.equal(await page.locator('#sentence-choose-production').isChecked(), false);
  retained(word, await snapshot(fixture, 'cloze-choice-neutral'));
  const sibling = await confirm(fixture, 'cloze');
  await startReview(fixture, sibling.entry);
  const clozeResponse = await answer(fixture, sibling.entry, source.token.s, { label: 'cloze-sibling' });
  await grade(fixture, sibling.entry, clozeResponse.response, 'easy', 'cloze-sibling');
  await page.locator('.close-doors .take').click(); fixture.siblingId = sibling.entry.plan.id;
  await openSource(fixture); const beforeKanji = await openWord(fixture);
  await page.locator(`#sheet [data-kanjirow="${source.focus}"]`).click();
  await page.locator(`#sheet[data-node="kanji:${source.focus}"]`).waitFor();
  assert.equal(await page.locator('#source-kanji-practice').getAttribute('data-focus-kanji'), source.focus);
  retained(beforeKanji, await snapshot(fixture, 'recursive-kanji-drawer-neutral'));
  await shot(fixture, 'source-connected-kanji-drawer');
  await page.locator('#source-kanji-practice').click(); await page.locator('#kanji-reading-confirm').waitFor();
  await focusedInViewport(page, 'kanji-reading-confirm');
  assert.equal(await page.locator('.sentence-original').textContent(), source.quote);
  assert.match(await page.locator('main').innerText(), /automatically supplied reading has not been reviewed[\s\S]*whole word/u);
  retained(beforeKanji, await snapshot(fixture, 'reading-choice-neutral'));
  await shot(fixture, 'explicit-whole-token-reading-choice');
  await page.locator('#sentence-practice-back').click();
  await page.locator(`#sheet[data-node="kanji:${source.focus}"]`).waitFor(); await focusedInViewport(page, 'source-kanji-practice');
  retained(beforeKanji, await snapshot(fixture, 'choice-cancel-restores-recursive-caller'));
  await page.locator('#source-kanji-practice').click(); await page.locator('#kanji-reading-confirm').waitFor();
  const reading = await confirm(fixture, 'kanji-reading', sibling.entry);
  siblingUnchanged(fixture, beforeKanji, reading.state);
  assert.equal(reading.state.record.sentencePractice.entries.length, 2);
  assert.deepEqual(Object.keys(reading.state.record.srs), [`sentence:${sibling.entry.plan.id}`]);
  // This is a genuine closed checkpoint, taken before reading response/grade.
  // It already contains the one operation; import does not invent actor history.
  const checkpoint = await snapshot(fixture, 'closed-checkpoint-before-reading-review');
  await close(fixture); assert.equal(activeContexts, 0);
  cpSync(join(fixture.out, fixture.profile), join(fixture.out, 'profile-recovery-point'), { recursive: true, errorOnExist: true, force: false });
  fixture.observations.push({ name: 'closed-same-installation-checkpoint', profile: 'profile-recovery-point',
    revision: checkpoint.revision, operationCount: checkpoint.rows.filter(row => row.kind === 'operation').length,
    readingResponses: 0, readingGrades: 0, liveContextCountDuringCopy: activeContexts });
  await launch(fixture); retained(checkpoint, await snapshot(fixture, 'reading-enrollment-after-full-restart'));
  await openSaved(fixture, reading.entry); await startReview(fixture, reading.entry);
  if (source.controls) {
    const wrong = await answer(fixture, reading.entry, source.wrong, { label: 'standalone-character-reading-refused', mustRepeat: true });
    const wrongGrade = await grade(fixture, reading.entry, wrong.response, 'again', 'standalone-character-reading');
    await shot(fixture, 'wrong-whole-token-reading-again'); await undo(fixture, wrongGrade, 'wrong-reading');
    const revealed = await answer(fixture, reading.entry, source.token.r, { label: 'revealed-reading', revealed: true, mustRepeat: true });
    const revealedGrade = await grade(fixture, reading.entry, revealed.response, 'again', 'revealed-reading');
    await undo(fixture, revealedGrade, 'revealed-reading');
    fixture.observations.push({ name: 'ordinary-focused-again-controls', wrongResponse: source.wrong,
      wholeTokenReading: source.token.r, wrongForcedAgain: true, matchingButRevealedForcedAgain: true,
      nativeWriteFaultsInjected: false, clocksSubstituted: false });
  }
  const text = source.answer || source.token.r;
  const first = await answer(fixture, reading.entry, text, { label: 'correct-reading' });
  await sourceDetour(fixture, { review: true, label: 'checked-reading-review' });
  const firstGrade = await grade(fixture, reading.entry, first.response, 'easy', 'correct-reading');
  await shot(fixture, 'finite-reading-review-complete'); await undo(fixture, firstGrade, 'correct-reading');
  const final = await answer(fixture, reading.entry, text, { label: 'final-reading' });
  const finalGrade = await grade(fixture, reading.entry, final.response, 'easy', 'final-reading');
  await fixture.page.locator('.close-doors .take').click();
  await history(fixture, reading.entry, finalGrade.after); await shot(fixture, 'saved-reading-history');
  const beforeRestart = await snapshot(fixture, 'saved-history-before-full-restart');
  await close(fixture); await launch(fixture);
  retained(beforeRestart, await snapshot(fixture, 'history-after-full-restart')); await history(fixture, reading.entry, beforeRestart);
  const exported = await exportUi(fixture);
  await close(fixture); await launch(fixture);
  retained(exported.after, await snapshot(fixture, 'export-metadata-after-full-restart'));
  await close(fixture); fixture.profile = 'profile-recovery-point'; await launch(fixture);
  retained(checkpoint, await snapshot(fixture, 'closed-local-checkpoint-reopened'));
  await importUi(fixture, exported.file);
  const restored = await snapshot(fixture, 'ordinary-ui-same-installation-restore'), expected = { ...exported.before.record };
  assert.deepEqual(restored.record, expected, 'Restore recovers every exact portable root, including absent draft libraries');
  assert.deepEqual(restored.archive, exported.before.archive); authorityUnchanged(checkpoint, restored);
  assert(restored.record.sentencePractice.responses.length > checkpoint.record.sentencePractice.responses.length);
  assert(restored.record.sentencePractice.grades.length > checkpoint.record.sentencePractice.grades.length);
  siblingUnchanged(fixture, checkpoint, restored);
  fixture.observations.push({ name: 'ordinary-ui-local-checkpoint-restore', checkpointRevision: checkpoint.revision,
    restoredRevision: restored.revision, sameInstallation: true, existingJournalRetainedExactlyOnce: true,
    exactAllPortableRoots: true, freshDeviceRecovery: 'not exercised' });
  await history(fixture, reading.entry, restored);
  const warmed = await sourceDetour(fixture, { label: 'restored-reading' }); await history(fixture, reading.entry, warmed);
  await fixture.page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  await close(fixture); await launch(fixture, { offline: true });
  retained(warmed, await snapshot(fixture, 'offline-full-browser-restart-before-navigation'));
  await history(fixture, reading.entry, warmed);
  const offline = await sourceDetour(fixture, { label: 'offline-retained-reading' });
  siblingUnchanged(fixture, checkpoint, offline); await shot(fixture, 'offline-retained-whole-token-reading');
  fixture.observations.push({ name: 'ordinary-connected-flow-complete', sourceId: source.id, authorLevel: source.level,
    readingEntryId: reading.entry.plan.id, clozeSiblingId: sibling.entry.plan.id, exactRetainedMetadata: reading.entry.plan.readingCue,
    rawCorrectResponse: text, independentSiblingScheduleAndHistory: true, fullBrowserRestartAndOfflineSource: true,
    rootAuthoredInput: true, humanComprehensionOrStandaloneKanjiMastery: false });
}

async function run({ source, engine, width }) {
  const out = join(OUT, `${engine}-${width}`, source.name);
  assert(!existsSync(out), 'Each case needs a fresh evidence/profile directory'); mkdirSync(out, { recursive: true });
  const fixture = { out, source, engine, width, profile: 'profile', context: null, page: null, facts: sourceFacts(source),
    episode: 0, phase: 'boot', wordVisits: 0, errors: [], externalRequests: [], audioRequests: [], observations: [], snapshots: [],
    screenshots: [], traces: [], lifecycle: [], assetLoads: [], assetWork: [] };
  const begun = Date.now(); let failure;
  try {
    await launch(fixture); await ordinary(fixture);
    assert.deepEqual(fixture.errors, []); assert.deepEqual(fixture.externalRequests, []); assert.deepEqual(fixture.audioRequests, []);
  } catch (error) {
    failure = error.stack || String(error); const phase = fixture.phase;
    if (fixture.context) {
      await shot(fixture, 'failure').catch(() => undefined); await snapshot(fixture, 'failure-native-record').catch(() => undefined);
    }
    fixture.phase = phase;
  } finally {
    if (fixture.context) await close(fixture).catch(error => { failure ||= error.stack || String(error); });
    disconnected = false;
  }
  if (!failure && (fixture.errors.length || fixture.externalRequests.length || fixture.audioRequests.length))
    failure = 'Unexpected application error, external request, or audio request during teardown';
  const result = { name: source.name, source: { ...source, corpusSha256: fixture.facts.sha256 }, engine, width,
    passed: !failure, failure, phase: fixture.phase, ordinaryUi: true, syntheticFaultsInjected: false,
    elapsedMs: Date.now() - begun, browserVersion: fixture.browserVersion, browserLaunches: fixture.episode,
    allContextsClosed: fixture.context === null, lifecycle: fixture.lifecycle, observations: fixture.observations,
    snapshots: fixture.snapshots, screenshots: fixture.screenshots, traces: fixture.traces, assets: fixture.assetLoads,
    errors: fixture.errors, externalRequests: fixture.externalRequests, audioRequests: fixture.audioRequests,
    audioOutput: TEST_AUDIO_OUTPUT, audioSilenceHelperSha256: helperSha256['browser-audio-silence.mjs'] };
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n'); results.push(result);
  console.log(JSON.stringify({ engine, width, case: source.name, passed: result.passed, failure })); return result.passed;
}
let integrityError;
try {
  writeFileSync(join(OUT, 'tested-build-identity.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(OUT, 'executed-verifier.mjs'), readFileSync(new URL(import.meta.url)));
  for (const file of helperFiles) writeFileSync(join(OUT, `executed-${file}`), readFileSync(new URL(file, import.meta.url)));
  for (const combination of selected) if (!await run(combination)) break;
} finally {
  disconnected = false; server.closeAllConnections(); await new Promise(done => server.close(done));
  try {
    verifyFiles(); assert.equal(sha(readFileSync(new URL(import.meta.url))), verifierSha256);
    for (const file of helperFiles) assert.equal(sha(readFileSync(new URL(file, import.meta.url))), helperSha256[file]);
    assert.equal(activeContexts, 0);
  } catch (error) { integrityError = error.stack || String(error); }
  const receipt = { suite: 'source-kanji-practice', version: 1, startedAt, completedAt: new Date().toISOString(),
    site: SITE, origin: ORIGIN, artifactSha256: manifest.artifactSha256, sourceAssetSha256: manifest.sourceAssetSha256,
    verifierSha256, helperSha256, audioOutput: TEST_AUDIO_OUTPUT, artifactVerifierAndHelpersUnchangedDuringRun: !integrityError,
    integrityError, selected: selected.map(row => ({ case: row.source.name, engine: row.engine, width: row.width })),
    expectedCases: selected.length, executedCases: results.length, passed: results.filter(row => row.passed).length,
    failed: results.filter(row => !row.passed).length, stoppedAfterFirstFailure: results.some(row => !row.passed),
    allContextsClosed: activeContexts === 0, maximumConcurrentContexts: 1,
    pass: !integrityError && results.length === selected.length && results.every(row => row.passed), results,
    limitations: [
      'Six assigned ordinary case/engine combinations cover N5/N3/N1 and both viewport widths, not a full twelve-case cross product.',
      'Native learner rows are observed only; ordinary controls create enrollment, response, grade, Undo, export and import.',
      'N5 focused controls use test-authored wrong/revealed answers through ordinary UI. No native write or current-source fault is injected.',
      'The reading contract compares an unreviewed supplied whole-token reading. Passing does not establish isolated-character mastery or Japanese correctness.',
      'Local restore uses an ordinarily evolved closed checkpoint of the same installation, including its real existing reading.resume operation. Fresh-device recovery is not exercised.',
      'Every context installs the shared test-only audio silence helper before app navigation. No audio controls are activated; no audibility or audio-quality claim is made.',
      'Persistent browser context close/reopen is distinct from a page reload. The completion timestamps do not attest individual OS child-process exit times.',
      'These bounded technical checks do not establish human comprehension, a full human journey, or learner acceptance.',
      'Only assertions reached before the recorded failure phase executed in a failing case.',
    ] };
  writeFileSync(join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ passed: receipt.passed, failed: receipt.failed, pass: receipt.pass, receipt: join(OUT, 'receipt.json') }));
  if (!receipt.pass) process.exitCode = 1;
}
