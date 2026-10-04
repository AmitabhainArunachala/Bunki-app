/** Single-file assessment packaging, actual public written-test persistence,
 * and a separately hashed synthetic bank for native audio delivery. */
/* The instrumented page exposes these globals for page.evaluate callbacks. */
/* global S, recordApp, recordWritable, loadAssessmentCatalog, startAssessmentRoom,
  applyAssessmentV2, currentAssessmentV2, assessmentMediaBytes, render,
  assessmentV2Notice, assessmentV2Pending */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json')));
const output = resolve(evidence, 'assessment-standalone.html');
const builder = resolve('prototypes/corridor/tools/build-standalone.mjs');
execFileSync(process.execPath, [builder, output], { stdio: 'inherit', timeout: 120000,
  env: { ...process.env, KAIRO_SITE_DIR: site, KAIRO_ARTIFACT_SHA256: identity.artifactSha256 } });
const build = JSON.parse(readFileSync(`${output}.build.json`));
const original = readFileSync(output, 'utf8'), sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.deepEqual(build.inlinedAssessmentModules, ['./assessment-v2-controller.mjs', './assessment-learning.mjs',
  './assessment-question-practice.mjs', './assessment-question-view.mjs', './assessment-question-source.mjs',
  './assessment-view.mjs', './assessment-delivery.mjs', './assessment-received.mjs']);
const packPattern = /(<script type="application\/json" id="standalone-assessment-assets">)([^<]*)(<\/script>)/u;
const packed = JSON.parse(original.match(packPattern)[2]);
const publicCatalog = JSON.parse(Buffer.from(packed['data/assessment/catalog.json'].base64, 'base64').toString());
const publicWrittenEntry = publicCatalog.entries.find(row => row.id === 'kairo-original-jlpt-n2-short-01:written-review');
assert(publicWrittenEntry?.availability.ready, 'The published written-test entry must be present and ready');
assert.equal(publicWrittenEntry.questionCount, 12);
assert.equal(publicWrittenEntry.editorialAtStart.status, 'ai-reviewed-practice');
for (const asset of build.assessmentAssets) {
  assert.equal(sha(Buffer.from(packed[asset.path].base64, 'base64')), asset.sha256);
  assert.equal(sha(readFileSync(resolve(site, asset.path))), asset.sha256);
}
const core = await import(pathToFileURL(resolve(site, 'modules/assessment-core.mjs')));
const record = await import(pathToFileURL(resolve(site, 'modules/record-core.mjs')));
const provenance = { kind: 'original-human', authorRef: 'synthetic-standalone-fixture', processRef: null, sources: [] };
const rights = { ...core.unknownAssessmentRights(), adapt: { status: 'allowed', basisRef: 'synthetic-only', policyVersion: 'fixture' } };
const wav = Buffer.alloc(8044); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(8000, 40);
const media = core.createMediaVersion({ format: 'kairo-assessment-media', v: 1, id: 'fixture:media', provenance, rights,
  kind: 'audio', assetId: 'synthetic-silence', bytesSha256: sha(wav), mimeType: 'audio/wav', durationMs: 500,
  transcript: '合成テスト', transcriptSha256: sha('合成テスト'), speakers: ['synthetic-silence'] });
const items = ['grammar', 'listening'].map(skill => core.createItemVersion({ format: 'kairo-assessment-item', v: 1,
  id: `fixture:${skill}`, provenance, rights, skill, task: skill === 'grammar' ? 'grammar-form' : 'fixture-listening',
  prompt: '駅へ（　）います。', translatedInstruction: 'Synthetic fixture.', rationale: 'Synthetic only.', subjects: [],
  passages: [], media: skill === 'listening' ? [core.artifactReference(media)] : [],
  response: { kind: 'selected', options: [{ id: 'a', text: '行って' }, { id: 'b', text: '行った' }], answerOptionId: 'a' } }));
const sections = items.map(item => ({ id: item.skill, title: item.skill, skill: item.skill, itemIds: [item.id] }));
const form = core.createFormVersion({ format: 'kairo-assessment-form', v: 1, id: 'synthetic-standalone-form', provenance, rights,
  title: 'Synthetic standalone assessment', exam: { family: 'jlpt', track: 'N2' }, scope: 'short-practice', blueprintId: null,
  items, passages: [], media: [media], sections, timingBlocks: [{ id: 'all', sectionIds: sections.map(row => row.id),
    durationMs: 60000, clock: 'elapsed-including-interruptions', authority: { kind: 'authoring-rule', ruleId: 'fixture' } }],
  authoring: { policyVersion: 'fixture', countsAre: 'authoring-rules', requirements: [] } });
const delivery = { schema: 'kairo-assessment-bank-delivery/1', form: core.artifactReference(form),
  assets: [{ assetId: media.assetId, path: 'audio/fixture.wav', bytesSha256: media.bytesSha256, mimeType: media.mimeType }],
  units: [{ id: 'fixture-unit', kind: 'question', itemIds: ['fixture:listening'], media: core.artifactReference(media),
    printedOptions: false, stimulusPlayCount: 1 }] };
const entry = { id: form.id, level: 'N2', mode: 'short', titleJa: '合成テスト', titleEn: form.title,
  questionCount: 2, durationMinutes: 1, sourceClass: 'original-human', sourceIds: [],
  formPath: 'forms/fixture.json', formSha256: form.sha256, deliveryPath: 'delivery/fixture.json',
  deliverySha256: record.encodeLocalJson(delivery).sha256, availability: { ready: true, reasons: [] }, review: { status: 'ai-reviewed' },
  editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'synthetic-only', decisionRevisionIds: ['fixture-no-content-approval'] } };
const fixture = {};
for (const [path, value] of Object.entries({ 'catalog.json': { schema: 'kairo-assessment-catalog/1', entries: [entry] },
  'sources.json': { schema: 'kairo-assessment-sources/1', sources: [] }, 'forms/fixture.json': form, 'delivery/fixture.json': delivery }))
  fixture[`data/assessment/${path}`] = { mimeType: 'application/json', base64: Buffer.from(JSON.stringify(value)).toString('base64') };
fixture['data/assessment/audio/fixture.wav'] = { mimeType: 'audio/wav', base64: wav.toString('base64') };
const exposed = ['S', 'recordApp', 'recordWritable', 'loadAssessmentCatalog', 'startAssessmentRoom', 'applyAssessmentV2',
  'currentAssessmentV2', 'assessmentMediaBytes', 'render', 'assessmentV2Notice', 'assessmentV2Pending'];
const instrument = html => {
  const cut = html.lastIndexOf('</script>');
  return html.slice(0, cut) + '\n' + exposed.map(name => `Object.defineProperty(window,${JSON.stringify(name)},{get:()=>${name}});`).join('\n') + html.slice(cut);
};
const synthetic = instrument(original.replace(packPattern, (_all, open, _json, close) => open + JSON.stringify(fixture) + close));
const documents = { public: resolve(evidence, 'public-instrumented-standalone.html'),
  synthetic: resolve(evidence, 'synthetic-standalone.html') };
writeFileSync(documents.public, instrument(original));
writeFileSync(documents.synthetic, synthetic);
// Observation only: no command wrapper, extra action, retry, or changed predicate.
const clickDiagnostics = process.env.KAIRO_ASSESSMENT_CLICK_DIAGNOSTICS === '1';
const results = [], failures = [];
const engines = process.env.KAIRO_BROWSER === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER || 'chromium'];
for (const engine of engines) for (const variant of ['public', 'synthetic']) {
  const profile = mkdtempSync(resolve(evidence, `${engine}-${variant}-`));
  const browser = await ({ chromium, webkit }[engine]).launchPersistentContext(profile, { headless: true });
  const page = browser.pages()[0], errors = [], requests = [];
  const documentURL = pathToFileURL(documents[variant]);
  documentURL.search = '?entry=shelf&ui=bi';
  let publicWritten = null, stage = 'boot';
  page.on('pageerror', error => errors.push(error.message));
  await browser.route('**/*', route => {
    const request = route.request();
    // Exercise the on-disk handoff without base64-encoding the full document
    // through route.fulfill and exceeding Chromium's DevTools pipe limit.
    if (request.isNavigationRequest() && request.frame() === page.mainFrame() && request.url() === documentURL.href)
      return route.continue();
    // WebKit routes document-local Blob modules through Playwright; Chromium
    // does not. They are embedded bytes, not external subresource requests.
    if (!request.isNavigationRequest() && /^(blob|data):/u.test(request.url())) return route.continue();
    requests.push(request.url()); return route.abort();
  });
  try {
    await page.goto(documentURL.href, { waitUntil: 'domcontentloaded' });
    // Completed boot, not just a writable flag: recordRecovered can turn true before
    // createRecordApp resolves and before boot marks the body ready (Codex STANDALONE-FAILURE-REVIEW).
    await page.waitForFunction(() => document.body.dataset.ready === '1' && typeof recordWritable === 'function' && recordWritable()
      && typeof recordApp === 'object' && recordApp?.current?.().status === 'active', null, { timeout: 60000 });
    const runtime = await page.evaluate(async () => {
      const runtime = await import(window.__KAIRO_RECORD_RUNTIME_URL__);
      const catalog = await loadAssessmentCatalog();
      const cache = await window.__KAIRO_ASSESSMENT_CACHE__.open('file-probe');
      await cache.put('file:///public-test.json', new Response('fixture'));
      return { methods: ['assessmentV2', 'assessmentLearning', 'assessmentQuestionPractice', 'assessmentQuestionView', 'assessmentQuestionSource',
        'assessmentView', 'assessmentDelivery', 'assessmentReceived'].every(key => !!runtime[key]),
        entries: catalog.entries.length, fileCache: await (await cache.match('file:///public-test.json')).text() };
    });
    assert(runtime.methods); assert.equal(runtime.fileCache, 'fixture');
    assert.equal(await page.locator('#standalone-assessment-assets').count(), 0,
      'Loading the assessment catalog consumes the lazily parsed asset pack');
    stage = 'runtime-ready';
    if (variant === 'public') {
      stage = 'start';
      publicWritten = await page.evaluate(async entryId => {
        const catalog = await loadAssessmentCatalog(), entry = catalog.entries.find(row => row.id === entryId);
        const probe = () => ({ ready: S.ready ?? null, bodyReady: document.body.dataset.ready || null,
          recordApp: !!recordApp, status: recordApp?.current?.().status ?? null,
          revision: recordApp?.current?.().snapshot?.revision ?? null, pending: recordApp?.pending ?? null,
          writable: recordWritable(), notice: typeof assessmentV2Notice === 'undefined' ? null : assessmentV2Notice });
        const before = probe();
        let rawStart = null, startError = null;
        try { rawStart = !!entry && await startAssessmentRoom(entry, 'practice'); }
        catch (error) { startError = { message: String(error?.message || error), stack: String(error?.stack || '').slice(0, 1200) }; }
        const selected = currentAssessmentV2();
        const started = rawStart === true;
        if (!started || !selected) return { started: false, stage: 'start', entryFound: !!entry, rawStart, startError,
          selectedPresent: !!selected, before, after: probe() };
        S.view = 'mock'; render();
        const item = selected.form.items[0];
        return { started, stage: 'started', entryFound: !!entry, rawStart, selectedPresent: true, before, after: probe(),
          formSha256: selected.form.sha256, questionCount: selected.form.items.length,
          attemptId: selected.attempt.attemptId, itemId: item.id, responseKind: item.response.kind,
          optionId: item.response.options?.at(-1)?.id, editorial: selected.attempt.editorialAtStart.status };
      }, publicWrittenEntry.id);
      assert.equal(publicWritten.started, true, `start failed: ${JSON.stringify(publicWritten)}`); assert.equal(publicWritten.formSha256, publicWrittenEntry.formSha256);
      assert.equal(publicWritten.questionCount, 12); assert.equal(publicWritten.responseKind, 'selected');
      assert.equal(publicWritten.editorial, 'ai-reviewed-practice');
      if (clickDiagnostics) await page.evaluate(expected => {
        const events = [], nodes = new WeakMap(); let nextNode = 0, droppedEvents = 0;
        const nodeId = node => {
          if (!node) return null;
          if (!nodes.has(node)) nodes.set(node, ++nextNode);
          return nodes.get(node);
        };
        const describe = node => node instanceof Element ? { node: nodeId(node), tag: node.tagName,
          id: node.id || null, optionId: node.getAttribute('data-exam-option'),
          disabled: 'disabled' in node ? node.disabled : null, connected: node.isConnected } : null;
        const currentButton = () => document.querySelector(`[data-exam-option="${CSS.escape(expected.optionId)}"]`);
        const probe = () => {
          const current = recordApp.current(), library = S.assessmentLibraryV2;
          const attempt = library?.attempts.find(row => row.attemptId === library.activeAttemptId);
          const answer = attempt?.answers.find(row => row.item.id === expected.itemId);
          return { view: S.view, writable: recordWritable(), recordPending: recordApp.pending,
            recordStatus: current.status, revision: current.snapshot?.revision ?? null,
            assessmentPending: assessmentV2Pending, visibility: document.visibilityState,
            selected: { activeAttemptId: library?.activeAttemptId ?? null, attemptId: attempt?.attemptId ?? null,
              revisionId: attempt?.revisionId ?? null, itemId: attempt?.cursor?.itemId ?? null,
              response: answer?.response ? { ...answer.response } : null },
            activeElement: describe(document.activeElement), button: describe(currentButton()) };
        };
        const diagnostic = window.__assessmentClickDiagnostic = { expected, before: probe(), events };
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
          document.addEventListener(type, event => {
            if (events.length === 24) { droppedEvents++; return; }
            const target = event.target instanceof Element ? event.target.closest('[data-exam-option]') : null;
            events.push({ type, at: event.timeStamp, trusted: event.isTrusted,
              mouseButton: event.button, pointerId: event.pointerId ?? null,
              target: describe(target), expectedNode: nodeId(currentButton()),
              pathIncludesExpected: event.composedPath().includes(currentButton()), ...probe() });
          }, { capture: true, passive: true });
        diagnostic.capture = () => ({ expected, before: diagnostic.before, events,
          eventLimit: 24, droppedEvents, after: probe() });
      }, publicWritten);
      stage = 'public-answer-click';
      await page.locator(`[data-exam-option="${publicWritten.optionId}"]`).click();
      stage = 'public-answer-persistence';
      await page.waitForFunction(({ itemId, optionId }) =>
        currentAssessmentV2()?.attempt.answers.find(row => row.item.id === itemId)?.response?.optionId === optionId, publicWritten);
      if (clickDiagnostics) publicWritten.clickDiagnostic = await page.evaluate(() => window.__assessmentClickDiagnostic.capture());
      const durableBefore = await page.evaluate(async () => {
        const state = await recordApp.snapshot();
        return state.snapshot.record.assessmentLibraryV2;
      });
      stage = 'reload-resume';
      await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === '1' && recordWritable()
        && recordApp?.current?.().status === 'active' && !!currentAssessmentV2());
      const resumed = await page.evaluate(({ itemId }) => {
        const selected = currentAssessmentV2();
        return { attemptId: selected.attempt.attemptId, formSha256: selected.form.sha256,
          answer: selected.attempt.answers.find(row => row.item.id === itemId)?.response,
          forms: recordApp.current().snapshot.record.assessmentLibraryV2.forms };
      }, publicWritten);
      assert.equal(resumed.attemptId, publicWritten.attemptId); assert.equal(resumed.formSha256, publicWritten.formSha256);
      assert.deepEqual(resumed.answer, { kind: 'selected', optionId: publicWritten.optionId });
      assert.deepEqual(resumed.forms, durableBefore.forms);
      publicWritten = { ...publicWritten, answerSaved: true, retainedAfterReload: true };
    }
    if (variant === 'synthetic') {
      assert.equal(await page.evaluate(async () => {
        const catalog = await loadAssessmentCatalog(); const saved = await startAssessmentRoom(catalog.entries[0], 'timed');
        if (!saved) return false;
        await applyAssessmentV2({ kind: 'answer', itemId: 'fixture:grammar', response: { kind: 'selected', optionId: 'b' } });
        await applyAssessmentV2({ kind: 'visit', itemId: 'fixture:listening' }); S.view = 'mock'; render(); return true;
      }), true);
      await page.locator('#exam-audio-play').click();
      await page.waitForFunction(() => currentAssessmentV2()?.attempt.audio[0]?.status === 'ended');
      const finished = await page.evaluate(async () => {
        const asset = await assessmentMediaBytes(currentAssessmentV2(), 'synthetic-silence');
        const saved = await applyAssessmentV2({ kind: 'submit' });
        return { saved, audioBytes: asset.bytes.byteLength, cards: S.taken.filter(row => row.t === 'sentence').length,
          terminal: currentAssessmentV2()?.attempt.status, writable: recordWritable() };
      });
      assert.deepEqual(finished, { saved: true, audioBytes: wav.length, cards: 1, terminal: 'submitted', writable: true });
      stage = 'reload-submitted';
      await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === '1' && recordWritable()
        && recordApp?.current?.().status === 'active' && currentAssessmentV2()?.attempt.status === 'submitted');
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(requests.filter(url => /assessment|\.mjs(?:$|\?)/u.test(url)), []);
    results.push({ engine, variant, passes: true, publicWritten, blockedExternalRequests: requests });
    console.log(`PASS ${engine}/${variant} standalone assessment`);
  } catch (error) {
    const state = await page.evaluate(expected => {
      const current = typeof recordApp === 'undefined' ? null : recordApp?.current();
      const selected = typeof currentAssessmentV2 === 'function' ? currentAssessmentV2() : null;
      return { text: document.body.innerText.slice(0, 1500),
        storeError: typeof S === 'undefined' ? null : S.storeError,
        recordState: current?.status ?? null, recordReason: current?.reason ?? null,
        revision: current?.snapshot?.revision ?? null, recordPending: typeof recordApp === 'undefined' ? null : recordApp?.pending,
        writable: typeof recordWritable === 'function' ? recordWritable() : null,
        assessmentPending: typeof assessmentV2Pending === 'undefined' ? null : assessmentV2Pending,
        view: typeof S === 'undefined' ? null : S.view, visibility: document.visibilityState,
        notice: typeof assessmentV2Notice === 'undefined' ? null : assessmentV2Notice,
        roomNotice: document.querySelector('.exam-notice')?.textContent ?? null,
        selected: selected && { attemptId: selected.attempt.attemptId, revisionId: selected.attempt.revisionId,
          status: selected.attempt.status, cursor: selected.attempt.cursor, clock: selected.attempt.clock,
          answer: selected.attempt.answers.find(row => row.item.id === expected?.itemId) ?? null },
        options: [...document.querySelectorAll('[data-exam-option]')].slice(0, 16).map(node => ({
          optionId: node.dataset.examOption, disabled: node.disabled, pressed: node.getAttribute('aria-pressed') })),
        clickDiagnostic: window.__assessmentClickDiagnostic?.capture() ?? null };
    }, publicWritten).catch(error => ({ captureError: String(error) }));
    failures.push({ engine, variant, stage, error: String(error), stack: String(error?.stack || '').slice(0, 2000), publicWritten, errors, requests, state });
    console.error(`FAIL ${engine}/${variant} at ${stage}: ${error}`);
    await page.screenshot({ path: resolve(evidence, `${engine}-${variant}-failure.png`), fullPage: true }).catch(() => {});
  } finally { await browser.close(); }
}
mkdirSync(evidence, { recursive: true });
writeFileSync(resolve(evidence, 'assessment-standalone.json'), JSON.stringify({ format: 'kairo-assessment-standalone-verification', v: 1,
  artifactSha256: identity.artifactSha256, originalSha256: sha(original), syntheticSha256: sha(synthetic), exposed, build,
  clickDiagnostics,
  syntheticAssets: Object.entries(fixture).map(([path, value]) => ({ path, sha256: sha(Buffer.from(value.base64, 'base64')) })),
  results, failures, limits: ['Synthetic ready bank and test-only export shim are separately hashed.', 'All external subresource requests are blocked; no live provider or editorial approval.'] }, null, 2) + '\n');
console.log(`Standalone assessment: ${results.length}/${results.length + failures.length} passed. ${evidence}`);
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
