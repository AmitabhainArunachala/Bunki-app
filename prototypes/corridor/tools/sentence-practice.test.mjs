import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
assert(process.env.KAIRO_SITE_DIR, 'Supply a staged KAIRO_SITE_DIR');
const site = resolve(process.env.KAIRO_SITE_DIR), manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json')));
for (const path of ['corridor.js', 'sentence-practice.mjs', 'sentence-drafts.mjs', 'sentence-draft-controller.mjs', 'teacher-context.mjs', 'teacher-drafts.mjs', 'modules/learning-core.mjs'])
  assert.equal(createHash('sha256').update(readFileSync(resolve(site, path))).digest('hex'), manifest.files.find((f) => f.path === path)?.sha256);
const api = await import(pathToFileURL(resolve(site, 'sentence-practice.mjs')));
const draftApi = await import(pathToFileURL(resolve(site, 'sentence-drafts.mjs')));
const { createSentenceDraftController } = await import(pathToFileURL(resolve(site, 'sentence-draft-controller.mjs')));
const { createTeacherContext, digestText } = await import(pathToFileURL(resolve(site, 'teacher-context.mjs')));
const text = '🚀の本。町の図書館で読む。', at = '2026-09-13T00:00:00.000Z';
const id = '29ee89c1-bca0-4c99-8579-137f4c226b06', responseId = '99de0109-e30f-49a6-a97a-dda7768a1518', gradeId = 'abcde000-1234-1234-1234-abcdef123456';
const context = await createTeacherContext({ sourceKind: 'personal-reading', sourceId: 'capture-fixture', sourceDigest: await digestText(text),
  unit: 'utf16-code-unit', start: 5, end: text.length, index: 5, quote: text.slice(5), title: '図書館', attribution: 'Learner-supplied synthetic text', url: null, target: null });
const entry = () => api.createSentencePractice({ context, start: 0, end: 1, modes: ['cloze', 'production'], at, id });
const root = () => api.acceptSentencePractice(null, entry());
const clone = (v) => JSON.parse(JSON.stringify(v));
const bundledSurfaces = ['前', '。', '🚀', 'の', '窓', 'と', '窓', 'を', '開け', 'ます', '。'];
const bundledContext = await createTeacherContext({ sourceKind: 'bundled-passage', sourceId: 'bundled-fixture',
  sourceDigest: await digestText(JSON.stringify(bundledSurfaces)), unit: 'token-index', start: 2, end: 11, index: 6,
  quote: bundledSurfaces.slice(2).join(''), title: '窓の文', attribution: 'Authored synthetic token fixture', url: null,
  target: { type: 'word', id: '窓' } });
const listeningCue = { version: 1, path: 'audio/s/ami/bundled-fixture-001.m4a', sha256: 'c'.repeat(64), bytes: 9000,
  sentenceIndex: 1, voice: 'ami', alignment: 'sentence-order', transcriptStatus: 'unreviewed' };
const cueCatalog = { version: 1, passages: { 'bundled-fixture': { sourceDigest: bundledContext.sourceDigest,
  sentences: [{ start: bundledContext.start, end: bundledContext.end, quote: bundledContext.quote, cue: listeningCue }] } } };
const draftIdentity = (entryId = entry().plan.id, overrides = {}) => ({ entryId, mode: 'production',
  revision: responseId, text: '  私の町。\n e\u0301 🚀\t', ...overrides });
const draftRoot = (...identities) => ({ version: 1, entries: identities.map((draft) => ({ ...draft, consumed: false })) });
function sentenceDraftTextareaFixture(mode, rawText) {
  // Exact staged app helpers and controller. Only DOM/storage/writer ports are
  // injected; the textarea port models CRLF/CR -> LF presentation. This is not
  // a browser test, and dispatchInput below is a synthetic input event.
  const code = readFileSync(resolve(site, 'corridor.js'), 'utf8');
  const extract = (start, end) => {
    const begin = code.indexOf(start), finish = code.indexOf(end, begin + start.length);
    assert(begin >= 0 && finish > begin, `Missing staged function ${start}`);
    return code.slice(begin, finish);
  };
  const prepared = api.prepareBundledSentencePractice(bundledContext, bundledSurfaces);
  const practice = api.acceptSentencePractice(null, api.createSentencePractice({ ...prepared,
    modes: ['production', 'listening'], at, id, listeningCue }));
  const original = draftIdentity(practice.entries[0].plan.id, { mode, text: rawText,
    ...(mode === 'listening' ? { transcriptOpened: false } : {}) });
  const key = { entryId: original.entryId, mode }, storage = new Map(), elements = [], inputs = [];
  let durable = draftApi.editSentenceDraft(null, original), serial = 1000, ui, refresh = true, inputEvents = 0;
  const controller = createSentenceDraftController({ installationText: 'textarea-newline-fixture', databaseName: 'textarea-newline-fixture',
    storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    assertCurrent: () => true, getDrafts: () => durable,
    revision: () => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`,
    commit: async produce => { durable = produce(durable); controller.refresh(); return true; },
    onChange: () => { if (refresh) ui?.refreshSentenceDraftSurfaces(); },
  });
  const el = (tag, cls = '', text = '') => {
    let value = '';
    const element = { tag, cls, text, dataset: {}, handlers: {}, children: [], isConnected: false, valueAssignments: 0,
      selectionStart: 0, selectionEnd: 0,
      get value() { return value; }, set value(raw) {
        value = String(raw).replace(/\r\n|\r/gu, '\n'); this.valueAssignments++;
        this.selectionStart = value.length; this.selectionEnd = value.length;
      },
      setAttribute() {}, append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
      addEventListener(name, handler) { this.handlers[name] = handler; } };
    elements.push(element); return element;
  };
  const document = { querySelectorAll: () => inputs.filter(input => input.isConnected),
    getElementById: id => elements.find(element => element.isConnected && element.id === id) ?? null };
  const createUi = new Function('ports', `
    const {sentenceDraftController,sentenceDraftModule,recordWritable,recordInstallation,document,storeSealed,
      el,biLabel,tx,readRecordDrafts,rememberRecordDraft,rememberCaptureDraft} = ports;
    ${extract('const sentenceDraftBindings =', '\nfunction renderUnavailableSentenceDrafts(')}
    ${extract('function submittedSentenceDraft(', '\nasync function flushSentenceDrafts()')}
    ${extract('function preserveVisibleDrafts()', '\nfunction releaseRecordOwnership()')}
    return {attachSentenceDraft,rememberSentenceDraft,submittedSentenceDraft,preserveVisibleDrafts,refreshSentenceDraftSurfaces};
  `);
  ui = createUi({ sentenceDraftController: controller, sentenceDraftModule: draftApi, recordWritable: () => true,
    recordInstallation: { text: 'textarea-newline-fixture' }, document, storeSealed: false,
    el, biLabel: (tag, cls, ja, en) => el(tag, cls, en), tx: (ja, en) => en,
    readRecordDrafts: () => ({}), rememberRecordDraft: () => true, rememberCaptureDraft: () => true });
  const input = el('textarea'); input.id = `sentence-${mode}-text`;
  const attached = ui.attachSentenceDraft(input, key, { current: () => true });
  for (const element of [input, attached.status, attached.recovery]) element.isConnected = true;
  inputs.push(input);
  return { ui, input, controller, original, key, practice,
    draft: () => controller.view(key).draft, durable: () => durable, inputEvents: () => inputEvents,
    dispatchInput: value => { input.value = value; inputEvents++; input.handlers.input({ type: 'input', target: input }); },
    publish: (next, updateUi = true) => { refresh = updateUi; durable = next; controller.refresh(); refresh = true; },
  };
}
for (const [newlineName, newline] of [['CRLF', '\r\n'], ['bare CR', '\r']]) {
  for (const mode of ['production', 'listening']) {
    const rawText = `  一行${newline}二行 e\u0301 🚀\t`, displayed = rawText.replace(/\r\n|\r/gu, '\n');
    test(`actual ${mode} helpers preserve and submit raw ${newlineName} without input, including a consumed stale editor`, async () => {
      const f = sentenceDraftTextareaFixture(mode, rawText);
      try {
        assert.equal(f.input.value, displayed); assert.equal(f.inputEvents(), 0);
        assert(f.ui.preserveVisibleDrafts()); assert(await f.controller.flush());
        assert.deepEqual(f.draft(), { ...f.original, consumed: false });
        const submitted = f.ui.submittedSentenceDraft(f.input);
        assert.deepEqual(submitted, f.original); assert.equal(f.inputEvents(), 0);
        const saved = api.saveSentenceDraftResponse(f.practice, f.durable(), { submitted, at,
          ...(mode === 'listening' ? { listening: { audioSha256: listeningCue.sha256, completedPlays: 1 } } : {}) });
        assert.equal(saved.sentencePractice.responses[0].text, rawText);
        assert.equal(saved.sentencePractice.responses[0].id, f.original.revision);
        assert.deepEqual(saved.sentencePractice.grades, []);
        // Inject delayed UI publication: the acknowledged response is current,
        // while the old connected editor still presents its previous value.
        f.publish(saved.sentenceDrafts, false); assert.equal(f.input.value, displayed);
        assert(f.ui.preserveVisibleDrafts()); assert(await f.controller.flush());
        assert.deepEqual(f.durable(), saved.sentenceDrafts); assert.equal(f.input.value, '');
        assert.equal(f.ui.submittedSentenceDraft(f.input), null);
        assert(f.ui.preserveVisibleDrafts()); assert.deepEqual(f.draft(), { ...f.original, consumed: true });
      } finally { f.controller.close(); }
    });
    test(`actual ${mode} refresh does not rewrite an unchanged ${newlineName} textarea presentation`, () => {
      const f = sentenceDraftTextareaFixture(mode, rawText);
      try {
        const assignments = f.input.valueAssignments;
        f.input.selectionStart = 2; f.input.selectionEnd = 4;
        for (let publication = 0; publication < 3; publication++) {
          f.controller.refresh(); f.ui.refreshSentenceDraftSurfaces();
        }
        assert.equal(f.input.valueAssignments, assignments, 'Unchanged publication must not invoke the textarea setter');
        assert.equal(f.input.value, displayed); assert.equal(f.input.selectionStart, 2); assert.equal(f.input.selectionEnd, 4);
        assert.deepEqual(f.draft(), { ...f.original, consumed: false }); assert.equal(f.inputEvents(), 0);
      } finally { f.controller.close(); }
    });
    test(`actual ${mode} input after ${newlineName} presentation creates an edit and preserves an explicit clear`, async () => {
      const f = sentenceDraftTextareaFixture(mode, rawText);
      try {
        f.dispatchInput(displayed); const normalizedEdit = clone(f.draft());
        assert.notEqual(normalizedEdit.revision, f.original.revision); assert.equal(normalizedEdit.text, displayed);
        assert(await f.controller.flush());
        f.dispatchInput(`${displayed} 追記。`);
        const edited = clone(f.draft()); assert.notEqual(edited.revision, normalizedEdit.revision);
        assert.equal(edited.text, `${displayed} 追記。`); assert(await f.controller.flush());
        assert(f.ui.preserveVisibleDrafts()); assert.deepEqual(f.draft(), edited);
        f.dispatchInput(''); const cleared = clone(f.draft());
        assert.notEqual(cleared.revision, edited.revision); assert.equal(cleared.text, ''); assert.equal(cleared.consumed, false);
        assert(await f.controller.flush()); f.ui.refreshSentenceDraftSurfaces();
        assert(f.ui.preserveVisibleDrafts()); assert.deepEqual(f.draft(), cleared);
        assert.equal(f.input.value, ''); assert.equal(f.inputEvents(), 3); assert.equal(f.ui.submittedSentenceDraft(f.input), null);
      } finally { f.controller.close(); }
    });
  }
  test(`actual listening exposure alone preserves raw ${newlineName} text and creates only an exposure revision`, async () => {
    const rawText = `一行${newline}二行`, f = sentenceDraftTextareaFixture('listening', rawText);
    try {
      assert(f.ui.rememberSentenceDraft(f.input, { transcriptOpened: true }));
      const exposed = clone(f.draft()); assert.notEqual(exposed.revision, f.original.revision);
      assert.deepEqual({ ...exposed, revision: f.original.revision }, { ...f.original, consumed: false, transcriptOpened: true });
      assert.equal(f.inputEvents(), 0); assert(await f.controller.flush());
      f.ui.refreshSentenceDraftSurfaces(); assert(f.ui.preserveVisibleDrafts());
      assert.deepEqual(f.draft(), exposed);
      assert(f.ui.rememberSentenceDraft(f.input, { transcriptOpened: true })); assert.deepEqual(f.draft(), exposed);
      assert.deepEqual(f.ui.submittedSentenceDraft(f.input), { ...f.original, revision: exposed.revision, transcriptOpened: true });
    } finally { f.controller.close(); }
  });
}
for (const change of ['unchanged', 'pending', 'published-same-text-revision']) test(
  `the actual export orchestration checks ${change} drafts after an awaited snapshot`, async () => {
    // Exact staged application functions and controller; storage/export/DOM
    // ports below are explicitly injected. This is not a native/browser test.
    const code = readFileSync(resolve(site, 'corridor.js'), 'utf8');
    const extract = (start, end) => {
      const begin = code.indexOf(start), finish = code.indexOf(end, begin + start.length);
      assert(begin >= 0 && finish > begin, `Missing staged function ${start}`);
      return code.slice(begin, finish);
    };
    let durable = null, runtime, counter = 100;
    const storage = new Map(), key = { entryId: entry().plan.id, mode: 'production' };
    const controller = createSentenceDraftController({ installationText: 'export-race-fixture', databaseName: 'export-race-fixture',
      storage: { getItem: key => storage.get(key) ?? null, setItem: (key, text) => storage.set(key, text) },
      assertCurrent: () => true, getDrafts: () => durable, onChange: () => {},
      revision: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
      commit: async produce => { durable = produce(durable); runtime?.publish({ sentenceDrafts: durable }); controller.refresh(); return true; },
    });
    let enter, release;
    const entered = new Promise(done => { enter = done; }), held = new Promise(done => { release = done; });
    const createRuntime = new Function('ports', `
      let publishedRecord = ports.record;
      const sentenceDraftController = ports.controller, teacherDraftController = null, sentenceDraftUnkept = new Map();
      const recordEpoch = 1, recordWritable = () => true, IMPORT_MAX_BYTES = 1024 * 1024;
      const plainRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
      const boundedImportValue = () => true, flushRecordDrafts = () => sentenceDraftController.flush();
      const recordApp = { exportBackup: ports.exportBackup };
      ${extract('function canonicalRecordJson(', 'function validArchiveTurn(')}
      ${extract('function recordDraftsSettled(', 'function preserveVisibleDrafts(')}
      ${extract('async function buildExportRecord(', 'const AI_EVIDENCE_ROLES')}
      return { exportRecord: buildExportRecord, publish: value => { publishedRecord = value; } };
    `);
    try {
      assert(controller.edit(key, '窓から海が見えます。')); assert(await controller.flush());
      const backup = { format: 'kairo-backup', completeness: 'complete', record: { sentenceDrafts: clone(durable) } };
      runtime = createRuntime({ controller, record: { sentenceDrafts: durable }, exportBackup: async () => { enter(); return held; } });
      const exported = runtime.exportRecord(); await entered;
      if (change !== 'unchanged') {
        assert(controller.edit(key, '途中の文。'));
        if (change === 'published-same-text-revision') {
          assert(controller.edit(key, '窓から海が見えます。')); assert(await controller.flush());
          assert.equal(controller.state().pending, false);
          assert.notEqual(durable.entries[0].revision, backup.record.sentenceDrafts.entries[0].revision);
        }
      }
      release({ status: 'active', backup });
      const result = await exported;
      if (change === 'unchanged') { assert.deepEqual(JSON.parse(result.text), backup); assert.equal(result.warning, undefined); }
      else { assert.equal(result.text, null); assert.equal(result.warning, 'drafts-changed'); }
    } finally { controller.close(); }
  });
test('explicit draft submission saves one unchecked response and consumes only that revision atomically', () => {
  const practice = root(), submitted = draftIdentity(), drafts = draftRoot(submitted);
  const before = clone({ practice, drafts });
  const saved = api.saveSentenceDraftResponse(practice, drafts, { submitted, at, latencyMs: 12 });
  assert.deepEqual({ practice, drafts }, before);
  assert.equal(saved.sentencePractice.responses.length, 1);
  assert.equal(saved.sentencePractice.responses[0].id, submitted.revision);
  assert.equal(saved.sentencePractice.responses[0].text, submitted.text);
  assert.equal(saved.sentencePractice.responses[0].observation.tier, 'B');
  assert.deepEqual(saved.sentencePractice.grades, []);
  assert.deepEqual(saved.sentencePractice.entries, practice.entries);
  assert.deepEqual(saved.sentenceDrafts.entries, [{ ...submitted, consumed: true }]);
  const retried = api.saveSentenceDraftResponse(saved.sentencePractice, saved.sentenceDrafts,
    { submitted, at: '2026-09-13T01:00:00.000Z', latencyMs: 99 });
  assert.deepEqual(retried, saved);
});
test('an older submitted revision never consumes newer same-text, empty or other-mode drafts', () => {
  const submitted = draftIdentity(), other = draftIdentity(submitted.entryId,
    { mode: 'listening', revision: '00000007-1234-4234-8234-123456789abc', transcriptOpened: true, text: '聞いた文。' });
  for (const text of [submitted.text, '']) {
    const newer = { ...submitted, revision: '00000006-1234-4234-8234-123456789abc', text };
    const drafts = draftRoot(newer, other);
    const saved = api.saveSentenceDraftResponse(root(), drafts, { submitted, at });
    assert.deepEqual(saved.sentenceDrafts, drafts);
    assert.equal(saved.sentencePractice.responses.length, 1);
    const retried = api.saveSentenceDraftResponse(saved.sentencePractice, drafts, { submitted, at });
    assert.deepEqual(retried, saved);
  }
});
test('draft submission refuses a response UUID collision, altered exposure and unconfirmed or absent work', () => {
  const submitted = draftIdentity(), drafts = draftRoot(submitted);
  const saved = api.saveSentenceDraftResponse(root(), drafts, { submitted, at });
  assert.throws(() => api.saveSentenceDraftResponse(saved.sentencePractice, null,
    { submitted: { ...submitted, text: '別の文。' }, at }), /sentence-response-collision/u);
  assert.throws(() => api.saveSentenceDraftResponse(root(), null, { submitted, at }), /sentence-draft-unavailable/u);
  const only = api.acceptSentencePractice(null, api.createSentencePractice({ context, start: 0, end: 1, modes: ['cloze'], at, id }));
  assert.throws(() => api.saveSentenceDraftResponse(only, drafts, { submitted, at }));
  for (const bad of [{ ...submitted, mode: 'cloze' }, { ...submitted, text: ' \n ' }, { ...submitted, extra: true }])
    assert.throws(() => api.saveSentenceDraftResponse(root(), drafts, { submitted: bad, at }));
  assert.throws(() => api.saveSentenceDraftResponse(root(), saved.sentenceDrafts, { submitted, at }), /sentence-draft-unavailable/u);
});
test('listening draft submission preserves exposure and the first playback metadata across a retry', () => {
  const prepared = api.prepareBundledSentencePractice(bundledContext, bundledSurfaces);
  const practice = api.acceptSentencePractice(null, api.createSentencePractice({ ...prepared, modes: ['listening'], at, id, listeningCue }));
  const submitted = draftIdentity(practice.entries[0].plan.id, { mode: 'listening', transcriptOpened: true });
  const drafts = draftRoot(submitted), listening = { audioSha256: listeningCue.sha256, completedPlays: 1 };
  assert.throws(() => api.saveSentenceDraftResponse(practice, drafts, { submitted, at }));
  assert.throws(() => api.saveSentenceDraftResponse(practice, drafts, { submitted, at, listening: { ...listening, completedPlays: 0 } }));
  const saved = api.saveSentenceDraftResponse(practice, drafts, { submitted, at, latencyMs: 120, listening });
  assert.equal(saved.sentencePractice.responses[0].revealed, true);
  assert.deepEqual(saved.sentencePractice.responses[0].listening, listening);
  assert.equal(saved.sentencePractice.responses[0].observation.rubricId, 'kairo-source-listening');
  assert.deepEqual(saved.sentencePractice.grades, []);
  assert.deepEqual(api.saveSentenceDraftResponse(saved.sentencePractice, saved.sentenceDrafts,
    { submitted, at: '2026-09-13T02:00:00.000Z', latencyMs: 9000, listening: { ...listening, completedPlays: 2 } }), saved);
  assert.throws(() => api.saveSentenceDraftResponse(saved.sentencePractice, null,
    { submitted: { ...submitted, transcriptOpened: false }, at, listening }), /sentence-response-collision/u);
});
test('listening catalog selection requires the exact installed source, quote and token occurrence', () => {
  assert.deepEqual(api.selectBundledListeningCue(bundledContext, bundledSurfaces, cueCatalog), listeningCue);
  for (const change of [null, { ...cueCatalog, version: 2 }, { ...cueCatalog, passages: {} }])
    assert.throws(() => api.selectBundledListeningCue(bundledContext, bundledSurfaces, change));
  const shifted = clone(cueCatalog); shifted.passages['bundled-fixture'].sentences[0].start++;
  assert.throws(() => api.selectBundledListeningCue(bundledContext, bundledSurfaces, shifted));
  assert.throws(() => api.selectBundledListeningCue(bundledContext, ['後', ...bundledSurfaces.slice(1)], cueCatalog));
  const duplicate = clone(cueCatalog); duplicate.passages['bundled-fixture'].sentences.push(clone(duplicate.passages['bundled-fixture'].sentences[0]));
  assert.throws(() => api.selectBundledListeningCue(bundledContext, bundledSurfaces, duplicate));
});
test('adding listening later preserves original promotion, text contracts and free responses', () => {
  const prepared = api.prepareBundledSentencePractice(bundledContext, bundledSurfaces);
  const first = api.acceptSentencePractice(null, api.createSentencePractice({ ...prepared, modes: ['cloze', 'production'], at, id }));
  const written = api.appendSentenceResponse(first, { entryId: first.entries[0].plan.id, mode: 'production', at, id: responseId, text: '窓を開けます。' });
  const next = api.acceptSentencePractice(written, api.createSentencePractice({ ...prepared, modes: ['listening'], at, id: gradeId,
    current: written, listeningCue }));
  assert.deepEqual(next.entries[0].plan.confirmation, first.entries[0].plan.confirmation);
  assert.deepEqual(next.entries[0].plan.contracts.slice(0, 2), first.entries[0].plan.contracts);
  assert.deepEqual(next.responses, written.responses); assert.equal(next.grades.length, 0);
  assert.equal(next.entries[0].plan.contracts[2].cueModality, 'audio');
  const changed = api.createSentencePractice({ ...prepared, modes: ['listening'], at, id: '11111111-2222-3333-4444-555555555555',
    current: next, listeningCue: { ...listeningCue, sha256: 'd'.repeat(64) } });
  assert.throws(() => api.acceptSentencePractice(next, changed), /listening-cue-changed/u);
});
test('listening responses retain exact writing, completed playback and transcript use without a grade', () => {
  const prepared = api.prepareBundledSentencePractice(bundledContext, bundledSurfaces);
  const confirmed = api.acceptSentencePractice(null, api.createSentencePractice({ ...prepared, modes: ['listening'], at, id, listeningCue }));
  const text = '  I understood an open window.\n e\u0301 🚀  ';
  const input = { entryId: confirmed.entries[0].plan.id, mode: 'listening', at, id: responseId, text, revealed: true,
    listening: { audioSha256: listeningCue.sha256, completedPlays: 2 } };
  const observed = api.appendSentenceResponse(confirmed, input);
  assert.deepEqual(api.parseSentencePractice(clone(observed)), observed);
  assert.equal(observed.responses[0].text, text); assert.equal(observed.responses[0].observation.tier, 'B');
  assert.equal(observed.responses[0].observation.rubricId, 'kairo-source-listening'); assert.equal(observed.grades.length, 0);
  for (const listening of [undefined, { ...input.listening, completedPlays: 0 }, { ...input.listening, audioSha256: 'd'.repeat(64) }])
    assert.throws(() => api.appendSentenceResponse(confirmed, { ...input, listening }));
  assert.throws(() => api.appendSentenceGrade(observed, { responseId, grade: 'easy', at, id: gradeId, revlogIndex: 0 }));
  const question = api.prepareSentenceQuestion(observed, { entryId: confirmed.entries[0].plan.id, responseId });
  assert(question.text.includes(text)); assert.match(question.text, /unchecked.*opened the transcript/su);
  assert.deepEqual(question.context, bundledContext);
});
test('the actual bundled catalog refuses excluded articles and pins the full source and recording bytes', async () => {
  const catalog = JSON.parse(readFileSync(resolve(site, 'audio/sentence-cues.json')));
  const index = JSON.parse(readFileSync(resolve(site, 'data/articles/index.json')));
  for (const [sourceId, source] of Object.entries(catalog.passages)) {
    const row = index.articles.find(row => row.id === sourceId);
    const article = JSON.parse(readFileSync(resolve(site, 'data/articles', row.file)));
    assert.equal(await digestText(JSON.stringify(article.tokens.map(token => token.s))), source.sourceDigest);
    for (const sentence of source.sentences) {
      assert.equal(article.tokens.slice(sentence.start, sentence.end).map(token => token.s).join(''), sentence.quote);
      const bytes = readFileSync(resolve(site, sentence.cue.path)); assert.equal(bytes.length, sentence.cue.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), sentence.cue.sha256);
      assert.equal(sentence.cue.transcriptStatus, 'unreviewed');
    }
  }
  assert(catalog.excluded.some(row => row.sourceId === 'wikinews:1403'));
  for (const row of catalog.excluded) assert.equal(Object.hasOwn(catalog.passages, row.sourceId), false);
});
test('bundled preparation maps the exact repeated encounter across token and UTF-16 coordinates without enrolling', () => {
  const prepared = api.prepareBundledSentencePractice(bundledContext, bundledSurfaces);
  assert.deepEqual(prepared.context, bundledContext); assert.equal(prepared.start, 5); assert.equal(prepared.end, 6);
  assert.deepEqual(prepared.tokenSpan, { unit: 'token-index', start: 2, end: 11, index: 6, surfaces: bundledSurfaces.slice(2) });
  assert.equal(Object.hasOwn(prepared, 'plan'), false);
  const saved = api.acceptSentencePractice(null, api.createSentencePractice({ ...prepared, modes: ['cloze', 'production'], at, id }));
  assert.deepEqual(api.parseSentencePractice(clone(saved)), saved);
  assert.equal(saved.entries[0].plan.capture.sourceRef.locator, `${bundledContext.id}#token=6;sentence-utf16=5,6`);
  assert.equal(Object.hasOwn(saved.entries[0].plan.origin, 'sentenceStart'), false);
});
test('bundled source verification binds all token boundaries, including text outside the saved sentence', () => {
  const resegmented = [...bundledSurfaces]; resegmented.splice(0, 2, '前。');
  assert.equal(resegmented.join(''), bundledSurfaces.join(''));
  for (const altered of [resegmented, ['後', ...bundledSurfaces.slice(1)], bundledSurfaces.slice(0, -1)])
    assert.throws(() => api.prepareBundledSentencePractice(bundledContext, altered), /sentence-context-changed/u);
  assert.throws(() => api.prepareBundledSentencePractice({ ...bundledContext, index: 4 }, bundledSurfaces));
  assert.throws(() => api.prepareBundledSentencePractice(context, bundledSurfaces));
});
test('bundled records cannot use an unbound token span or disguise it as a text origin', () => {
  const prepared = api.prepareBundledSentencePractice(bundledContext, bundledSurfaces);
  assert.throws(() => api.createSentencePractice({ context: bundledContext, start: 5, end: 6, modes: ['cloze'], at, id }));
  assert.throws(() => api.createSentencePractice({ ...prepared, tokenSpan: { ...prepared.tokenSpan, index: 4 }, modes: ['cloze'], at, id }));
  assert.throws(() => api.createSentencePractice({ ...prepared, context, modes: ['cloze'], at, id }));
  const saved = api.acceptSentencePractice(null, api.createSentencePractice({ ...prepared, modes: ['cloze'], at, id }));
  const damaged = clone(saved); damaged.entries[0].plan.origin.sentenceStart = 2;
  assert.throws(() => api.parseSentencePractice(damaged));
});
test('bundled writing, later cloze and question preparation preserve the same source and original promotion', () => {
  const prepared = api.prepareBundledSentencePractice(bundledContext, bundledSurfaces);
  const first = api.createSentencePractice({ ...prepared, modes: ['production'], at, id });
  const written = api.appendSentenceResponse(api.acceptSentencePractice(null, first), { entryId: first.plan.id,
    mode: 'production', at, id: responseId, text: '  家の窓を開けます。🚀\n e\u0301  ' });
  const later = api.createSentencePractice({ ...prepared, modes: ['cloze'], at, id: gradeId, current: written });
  const next = api.acceptSentencePractice(written, later);
  assert.deepEqual(next.entries[0].plan.confirmation, first.plan.confirmation);
  assert.deepEqual(next.responses, written.responses);
  const question = api.prepareSentenceQuestion(next, { entryId: first.plan.id, responseId });
  assert.deepEqual(question.context, bundledContext); assert(question.text.includes(written.responses[0].text));
  assert.equal(next.grades.length, 0); assert.equal(written.responses[0].observation.tier, 'B');
});
test('empty/captured state has no contracts; confirmation round-trips exact Unicode source and independent modalities', () => {
  assert.deepEqual(api.parseSentencePractice(null), { version: 1, entries: [], responses: [], grades: [] });
  const value = root(); assert.equal(value.entries.length, 1); assert.equal(value.entries[0].context.quote, context.quote);
  assert.equal(value.entries[0].plan.contracts.length, 2); assert.deepEqual(api.parseSentencePractice(clone(value)), value);
  assert.deepEqual(api.acceptSentencePractice(value, entry()), value);
});
test('same reference cannot conceal altered source bytes, metadata or prompt/answer definitions', () => {
  for (const corrupt of [v=>{v.entries[0].context.quote='村の図書館で読む。';},v=>{v.entries[0].context.title='fabricated';},
    v=>{v.entries[0].plan.contracts[0].acceptedAnswers=['村'];},v=>{v.entries[0].plan.origin.start=1;},v=>{v.entries[0].context.extra=true;}]) {
    const value = clone(root()); corrupt(value); assert.throws(()=>api.parseSentencePractice(value));
  }
});
test('later writing choice appends one contract and preserves the earlier recall and grade evidence', () => {
  const first = api.createSentencePractice({ context, start: 0, end: 1, modes: ['cloze'], at, id });
  const answered = api.appendSentenceResponse(api.acceptSentencePractice(null, first), {
    entryId: first.plan.id, mode: 'cloze', at, id: responseId, text: '町', latencyMs: 250,
  });
  const current = api.appendSentenceGrade(answered, { responseId, grade: 'easy', at, id: gradeId, revlogIndex: 0 }).root;
  const saved = clone(current), later = '2026-09-13T00:01:00.000Z';
  const candidate = api.createSentencePractice({ context, start: 0, end: 1, modes: ['production'], at: later,
    id: '00000002-1234-1234-1234-123456789abc', current });
  const next = api.acceptSentencePractice(current, candidate);
  assert.deepEqual(current, saved); assert.equal(next.entries.length, 1);
  const plan = next.entries[0].plan;
  assert.equal(plan.id, first.plan.id); assert.deepEqual(plan.capture, first.plan.capture);
  assert.deepEqual(plan.contracts[0], first.plan.contracts[0]);
  assert.deepEqual(plan.confirmation, first.plan.confirmation);
  assert.equal(plan.contracts[1].occurredAt, later);
  assert.equal(plan.contracts.length, 2); assert.deepEqual(next.responses, current.responses); assert.deepEqual(next.grades, current.grades);
  assert.deepEqual(api.acceptSentencePractice(next, candidate), next);
  const implicit = api.createSentencePractice({ context, start: 0, end: 1, modes: ['production'], at: later,
    id: '00000003-1234-1234-1234-123456789abc' });
  assert.throws(() => api.acceptSentencePractice(current, implicit));
  assert.throws(() => api.acceptSentencePractice(current, api.createSentencePractice({
    context, start: 0, end: 1, modes: ['production'], at: later, id, current,
  })));
});
test('writing first can later add recall without changing its original response or replacing the plan', () => {
  const first = api.createSentencePractice({ context, start: 0, end: 1, modes: ['production'], at, id });
  const current = api.appendSentenceResponse(api.acceptSentencePractice(null, first), {
    entryId: first.plan.id, mode: 'production', at, id: responseId, text: '町に住んでいます。',
  });
  const added = api.createSentencePractice({ context, start: 0, end: 1, modes: ['cloze', 'production'], at,
    id: '00000004-1234-1234-1234-123456789abc', current });
  const next = api.acceptSentencePractice(current, added);
  assert.equal(next.entries.length, 1); assert.equal(next.entries[0].plan.id, first.plan.id);
  assert.deepEqual(next.entries[0].plan.contracts[0], first.plan.contracts[0]);
  assert.deepEqual(next.entries[0].plan.confirmation, first.plan.confirmation);
  assert.deepEqual(next.responses, current.responses); assert.equal(next.grades.length, 0);
  assert.deepEqual(next.entries[0].plan.contracts.map((event) => event.responseModality), ['free', 'text']);
  const response = '00000005-1234-1234-1234-123456789abc';
  const answered = api.appendSentenceResponse(next, { entryId: first.plan.id, mode: 'cloze', at, id: response, text: '町' });
  assert.equal(api.appendSentenceGrade(answered, { responseId: response, grade: 'good', at, id: gradeId, revlogIndex: 0 }).grade, 'good');
});
test('responses append without mutating caller data and stay separate from grading', () => {
  const before = root(), snapshot = clone(before);
  const next = api.appendSentenceResponse(before,{entryId:entry().plan.id,mode:'cloze',at,id:responseId,text:'町',latencyMs:450});
  assert.deepEqual(before,snapshot); assert.equal(next.responses.length,1); assert.equal(next.grades.length,0);
  assert.equal(next.responses[0].observation,null);
  assert.throws(()=>api.appendSentenceResponse(next,{entryId:entry().plan.id,mode:'cloze',at,id:responseId,text:'町'}));
});
test('grade binds the saved response, applies reveal/mismatch law, and refuses repeated grading or changed reveal evidence', () => {
  for (const [text,revealed,grade] of [['町',false,'easy'],['町',true,'again'],['村',false,'again']]) {
    const answered = api.appendSentenceResponse(root(),{entryId:entry().plan.id,mode:'cloze',at,id:responseId,text,revealed});
    const input={responseId,grade:'easy',at,id:gradeId,revlogIndex:0}; const result=api.appendSentenceGrade(answered,input);
    assert.equal(result.grade,grade); assert.equal(result.root.grades[0].observation.grade,grade);
    assert.throws(()=>api.appendSentenceGrade(result.root,input));
    const corrupted=clone(result.root);corrupted.grades[0].observation.hintsUsed=1;assert.throws(()=>api.parseSentencePractice(corrupted));
  }
});
test('free production keeps exact text with a versioned unchecked observation and cannot enter the cloze grade path', () => {
  const text='  私の町には小さな図書館があります。🚀\n e\u0301  ';
  const value=api.appendSentenceResponse(root(),{entryId:entry().plan.id,mode:'production',at,id:responseId,text});
  assert.equal(value.responses[0].text,text);assert.equal(value.responses[0].observation.type,'ProductionObserved');
  assert.equal(value.responses[0].observation.tier,'B');assert(!Object.hasOwn(value.responses[0].observation,'grade'));assert.equal(value.grades.length,0);
  assert.throws(()=>api.appendSentenceGrade(value,{responseId,grade:'good',at,id:gradeId,revlogIndex:0}));
});
test('unconfirmed production, blank production, unknown modes and malformed Unicode fail closed', () => {
  const only=api.acceptSentencePractice(null,api.createSentencePractice({context,start:0,end:1,modes:['cloze'],at,id}));
  for (const props of [{mode:'production',text:'町に住む。'},{mode:'unknown',text:'町'},{mode:'cloze',text:'\ud800'}])
    assert.throws(()=>api.appendSentenceResponse(only,{entryId:only.entries[0].plan.id,at,id:responseId,...props}));
  assert.throws(()=>api.appendSentenceResponse(root(),{entryId:entry().plan.id,at,id:responseId,mode:'production',text:'\n  '}));
});
test('the envelope binds sentence membership and actual review rows to immutable graded responses; undo remains append-only', () => {
  const answered=api.appendSentenceResponse(root(),{entryId:entry().plan.id,mode:'cloze',at,id:responseId,text:'町'});
  const graded=api.appendSentenceGrade(answered,{responseId,grade:'good',at,id:gradeId,revlogIndex:0}).root;
  const row=[Date.parse(at),`sentence:${entry().plan.id}`,3];
  const record={sentencePractice:graded,teacherContexts:{entries:[context]},taken:[{t:'sentence',id:entry().plan.id,label:context.quote,sourceContextRef:context.id}],revlog:[row]};
  assert(api.validateSentencePracticeRecord(record));
  assert(api.validateSentencePracticeRecord({...record,revlog:[row,[Date.parse(at)+1,row[1],0,0]]}));
  assert(!api.validateSentencePracticeRecord({...record,teacherContexts:{entries:[]}}));
  assert(!api.validateSentencePracticeRecord({...record,revlog:[[row[0],row[1],4]]}));
  assert(!api.validateSentencePracticeRecord({...record,sentencePractice:{...graded,grades:[]}}));
});
const writing = () => api.appendSentenceResponse(root(), { entryId: entry().plan.id, mode: 'production', at,
  id: responseId, text: '  私の町には小さな図書館があります。\r\n e\u0301 🚀  ' });
const questionDraft = (text, consumed = false) => ({ contextRef: context.id,
  revision: '0951f273-f662-4c97-a005-87e92415ee49', text, consumed });
test('a question retains the exact saved response, source and prior question without assessing either', () => {
  const current = writing(), before = clone(current), previous = questionDraft('  前の質問。\nWhy here? e\u0301 🚀\t');
  for (const language of ['en', 'ja']) {
    const prepared = api.prepareSentenceQuestion(current, { entryId: entry().plan.id, responseId, draft: previous, language });
    assert.deepEqual(prepared.context, context); assert.deepEqual(prepared.response, current.responses[0]);
    assert(prepared.text.startsWith(`${previous.text}\n\n`)); assert(prepared.text.includes(current.responses[0].text));
    assert(prepared.text.includes('「町」')); assert.equal(prepared.alreadyIncluded, false);
    assert.deepEqual(current, before); assert.equal(current.grades.length, 0);
    const repeated = api.prepareSentenceQuestion(current, { entryId: entry().plan.id, responseId,
      draft: questionDraft(prepared.text), language });
    assert.equal(repeated.text, prepared.text); assert.equal(repeated.alreadyIncluded, true);
  }
});
test('a consumed draft starts a new question; a newer question is preserved in full', () => {
  const current = writing(), input = { entryId: entry().plan.id, responseId };
  const fresh = api.prepareSentenceQuestion(current, input);
  assert.equal(api.prepareSentenceQuestion(current, { ...input, draft: questionDraft('previously sent', true) }).text, fresh.text);
  const changed = questionDraft(`A newer edit of my own.\n${fresh.text}\nAnother question.`);
  assert.equal(api.prepareSentenceQuestion(current, { ...input, draft: changed }).text, changed.text);
  assert.equal(changed.consumed, false);
});
test('question preparation refuses missing, mismatched, cloze or altered evidence and foreign drafts', () => {
  const current = writing(), input = { entryId: entry().plan.id, responseId };
  for (const alteration of [{ responseId: id }, { entryId: 'different-entry' }, { language: 'unknown' },
    { draft: { ...questionDraft('A question'), contextRef: null } },
    { draft: questionDraft('\ud800') }, { draft: { ...questionDraft('A question'), extra: true } }])
    assert.throws(() => api.prepareSentenceQuestion(current, { ...input, ...alteration }));
  const cloze = api.appendSentenceResponse(root(), { entryId: entry().plan.id, mode: 'cloze', at, id: responseId, text: '町' });
  assert.throws(() => api.prepareSentenceQuestion(cloze, input));
  const damaged = clone(current); damaged.responses[0].observation.tier = 'A';
  assert.throws(() => api.prepareSentenceQuestion(damaged, input));
  damaged.responses[0].observation = current.responses[0].observation; damaged.entries[0].context.title = 'different';
  assert.throws(() => api.prepareSentenceQuestion(damaged, input));
});
test('question length uses the real UTF-16 draft boundary and never truncates either input', () => {
  const current = writing(), input = { entryId: entry().plan.id, responseId };
  const fresh = api.prepareSentenceQuestion(current, input);
  const prior = questionDraft('🚀'.repeat(Math.floor((64000 - fresh.text.length - 2) / 2)));
  const remaining = 64000 - fresh.text.length - 2 - prior.text.length;
  prior.text += 'x'.repeat(remaining);
  assert.equal(api.prepareSentenceQuestion(current, { ...input, draft: prior }).text.length, 64000);
  const tooLong = questionDraft(`${prior.text}x`), preserved = clone(tooLong);
  assert.throws(() => api.prepareSentenceQuestion(current, { ...input, draft: tooLong }), /sentence-question-too-long/u);
  assert.deepEqual(tooLong, preserved); assert.equal(current.responses[0].text, writing().responses[0].text);
});
