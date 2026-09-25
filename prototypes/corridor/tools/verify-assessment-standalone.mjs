/** Single-file assessment packaging, actual public written-test persistence,
 * and a separately hashed synthetic bank for native audio delivery. */
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
  'currentAssessmentV2', 'assessmentMediaBytes', 'render'];
const instrument = html => {
  const cut = html.lastIndexOf('</script>');
  return html.slice(0, cut) + '\n' + exposed.map(name => `Object.defineProperty(window,${JSON.stringify(name)},{get:()=>${name}});`).join('\n') + html.slice(cut);
};
const synthetic = instrument(original.replace(packPattern, (_all, open, _json, close) => open + JSON.stringify(fixture) + close));
writeFileSync(resolve(evidence, 'synthetic-standalone.html'), synthetic);
const results = [], failures = [];
const engines = process.env.KAIRO_BROWSER === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER || 'chromium'];
for (const engine of engines) for (const variant of ['public', 'synthetic']) {
  const profile = mkdtempSync(resolve(evidence, `${engine}-${variant}-`));
  const browser = await ({ chromium, webkit }[engine]).launchPersistentContext(profile, { headless: true });
  const page = browser.pages()[0], errors = [], requests = [];
  let publicWritten = null;
  page.on('pageerror', error => errors.push(error.message));
  await browser.route('**/*', route => {
    if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: variant === 'public' ? instrument(original) : synthetic });
    // WebKit routes document-local Blob modules through Playwright; Chromium
    // does not. They are embedded bytes, not external subresource requests.
    if (/^(blob|data):/u.test(route.request().url())) return route.continue();
    requests.push(route.request().url()); return route.abort();
  });
  try {
    await page.goto('http://127.0.0.1:3000/?entry=shelf&ui=bi', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof recordWritable === 'function' && recordWritable(), null, { timeout: 60000 });
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
    if (variant === 'public') {
      publicWritten = await page.evaluate(async entryId => {
        const catalog = await loadAssessmentCatalog(), entry = catalog.entries.find(row => row.id === entryId);
        const started = !!entry && await startAssessmentRoom(entry, 'practice');
        const selected = currentAssessmentV2();
        if (!started || !selected) return { started: false };
        S.view = 'mock'; render();
        const item = selected.form.items[0];
        return { started, formSha256: selected.form.sha256, questionCount: selected.form.items.length,
          attemptId: selected.attempt.attemptId, itemId: item.id, responseKind: item.response.kind,
          optionId: item.response.options?.at(-1)?.id, editorial: selected.attempt.editorialAtStart.status };
      }, publicWrittenEntry.id);
      assert.equal(publicWritten.started, true); assert.equal(publicWritten.formSha256, publicWrittenEntry.formSha256);
      assert.equal(publicWritten.questionCount, 12); assert.equal(publicWritten.responseKind, 'selected');
      assert.equal(publicWritten.editorial, 'ai-reviewed-practice');
      await page.locator(`[data-exam-option="${publicWritten.optionId}"]`).click();
      await page.waitForFunction(({ itemId, optionId }) =>
        currentAssessmentV2()?.attempt.answers.find(row => row.item.id === itemId)?.response?.optionId === optionId, publicWritten);
      const durableBefore = await page.evaluate(async () => {
        const state = await recordApp.snapshot();
        return state.snapshot.record.assessmentLibraryV2;
      });
      await page.reload(); await page.waitForFunction(() => recordWritable() && !!currentAssessmentV2());
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
      await page.reload(); await page.waitForFunction(() => recordWritable() && currentAssessmentV2()?.attempt.status === 'submitted');
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(requests.filter(url => /assessment|\.mjs(?:$|\?)/u.test(url)), []);
    results.push({ engine, variant, passes: true, publicWritten, blockedExternalRequests: requests });
    console.log(`PASS ${engine}/${variant} standalone assessment`);
  } catch (error) {
    const state = await page.evaluate(() => ({ text: document.body.innerText.slice(0, 1500),
      storeError: typeof S === 'undefined' ? null : S.storeError,
      recordState: typeof recordApp === 'undefined' ? null : recordApp?.current()?.status })).catch(() => null);
    failures.push({ engine, variant, error: String(error), errors, requests, state }); console.error(`FAIL ${engine}/${variant}: ${error}`);
    await page.screenshot({ path: resolve(evidence, `${engine}-${variant}-failure.png`), fullPage: true }).catch(() => {});
  } finally { await browser.close(); }
}
mkdirSync(evidence, { recursive: true });
writeFileSync(resolve(evidence, 'assessment-standalone.json'), JSON.stringify({ format: 'kairo-assessment-standalone-verification', v: 1,
  artifactSha256: identity.artifactSha256, originalSha256: sha(original), syntheticSha256: sha(synthetic), exposed, build,
  syntheticAssets: Object.entries(fixture).map(([path, value]) => ({ path, sha256: sha(Buffer.from(value.base64, 'base64')) })),
  results, failures, limits: ['Synthetic ready bank and test-only export shim are separately hashed.', 'All external subresource requests are blocked; no live provider or editorial approval.'] }, null, 2) + '\n');
console.log(`Standalone assessment: ${results.length}/${results.length + failures.length} passed. ${evidence}`);
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
