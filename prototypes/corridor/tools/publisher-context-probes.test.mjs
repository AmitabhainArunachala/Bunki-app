// Node-side controls for the diagnostic-only saved-context probes (window 4 slot 1, lead 1643):
// anchors exact-once, a probe-only diff, and exit labelling — each mutant must make the real probed
// keepSelection, run in a sandbox, name exactly its own exit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { PROBES, PROBE_VERSION, MUTANTS, applyProbes, applyMutant, probeOnlyDiff, keepSelectionText } from './publisher-context-probes.mjs';

const source = readFileSync(new URL('../corridor.js', import.meta.url), 'utf8');

/** Run the (probed, maybe mutated) keepSelection closure once, with stubs for everything it closes over. */
async function runKeepSelection(text, discuss) {
  const sandbox = {
    window: { scrollTo() {} }, performance: { now: () => 0 },
    recordWritable: () => true, recordReady: () => true, refresh() {}, keepScroll() {}, stopReadAloud() {}, render() {},
    ensureTeacherContextModule: async () => ({ selectTeacherContext: (root, context) => ({ root, context }), activateTeacherContext: (root) => root }),
    makeContext: async () => ({ id: 'context' }), resolveTeacherSource: async () => {},
    commitStorePatch: async (producer) => { producer({ publisherLibrary: {}, teacherContexts: {} }); return true; },
    personal: false, sourceInboxModule: {}, publisherModule: { selectPublisherReading: () => true }, saved: { receiptSha256: 'x' },
    selectionKey: (s) => `${s.start}:${s.end}`, S: {}, AI_CHAT_PAGE: 1, status: { textContent: '' },
    tx: (ja, en) => en, section: { isConnected: true }, teacherSourceError: () => 'source error', recordEpoch: 1,
  };
  vm.createContext(sandbox);
  vm.runInContext(`var teacherContextSelectionSerial = 0; var keptAt = null; var pending = false;
    var selection = { start: 0, end: 1, quote: '町' };\n${text}\nglobalThis.keepSelection = keepSelection;`, sandbox);
  const returned = await sandbox.keepSelection(discuss, { isConnected: true });
  return { returned, ids: Array.from(sandbox.window.__ctxDiag || [], (row) => String(row.id)), status: sandbox.status.textContent, view: sandbox.S.view };
}

test('every probe anchor occurs exactly once in corridor.js, and a missing or doubled anchor stops the run', () => {
  const { applied } = applyProbes(source);
  assert.deepEqual(applied, ['version', ...PROBES.map((probe) => probe.id)]);
  assert.throws(() => applyProbes(source.replace(PROBES[1].from, '')), /anchor occurs 0 times/);
  assert.throws(() => applyProbes(source + '\n' + PROBES[3].from), /anchor occurs 2 times/);
  for (const name of Object.keys(MUTANTS)) {
    const probed = applyProbes(source).source;
    assert.throws(() => applyMutant(probed + '\n' + MUTANTS[name].from, name), /anchor occurs 2 times/, name);
  }
});

test('the probed source differs from corridor.js only by the probe records (probe-only diff guard)', () => {
  const { source: probed } = applyProbes(source);
  assert.notEqual(probed, source);
  assert.equal(probeOnlyDiff(source, probed), true);
  // a non-probe edit anywhere is caught
  assert.equal(probeOnlyDiff(source, probed.replace("'Saved with its source.'", "'Saved.'")), false);
  assert.equal(probeOnlyDiff(source, probed.replace('const keepSave = saveOne({', 'const keepSave = saveOne({ ')), false);
});

test('the served source starts with exactly one executed version witness, and the guard rejects it missing or doubled', () => {
  const { source: probed } = applyProbes(source);
  const line = `window.__ctxDiagVersion = ${JSON.stringify(PROBE_VERSION)};\n`;
  assert.ok(probed.startsWith(line));
  assert.equal(probed.split(line).length - 1, 1);
  assert.equal(probeOnlyDiff(source, probed.slice(line.length)), false);
  assert.equal(probeOnlyDiff(source, line + probed), false);
  assert.throws(() => applyProbes(probed), /already present|anchor occurs/);
  // it executes: evaluating the line in a fresh context sets the witness
  const sandbox = { window: {} };
  vm.runInNewContext(line, sandbox);
  assert.equal(sandbox.window.__ctxDiagVersion, PROBE_VERSION);
});

test('the unprobed closure records nothing; the probed baseline names its path', async () => {
  const plain = await runKeepSelection(keepSelectionText(source), true);
  assert.deepEqual(plain.ids, []);
  assert.equal(plain.returned, true);
  const probed = keepSelectionText(applyProbes(source).source);
  const open = await runKeepSelection(probed, true);
  assert.deepEqual(open.ids, ['enter', 'serial', 'a-module', 'a-context', 'a-source', 'commit', 'branch', 'nav']);
  assert.equal(open.view, 'ai');
  const save = await runKeepSelection(probed, false);
  assert.deepEqual(save.ids, ['enter', 'serial', 'a-module', 'a-context', 'a-source', 'commit', 'branch', 'else']);
  assert.equal(save.status, 'Saved with its source.');
});

for (const [name, expectedTail] of Object.entries({
  'x-guard': ['enter', 'x-guard'],
  'x-catch': ['enter', 'serial', 'a-module', 'a-context', 'a-source', 'x-catch'],
  'x-kept': ['enter', 'serial', 'a-module', 'a-context', 'a-source', 'commit', 'x-kept'],
  else: ['enter', 'serial', 'a-module', 'a-context', 'a-source', 'commit', 'branch', 'else'],
})) {
  test(`exit-labelling mutant ${name}: the open path names exactly ${name} and does not navigate`, async () => {
    const text = keepSelectionText(applyMutant(applyProbes(source).source, name));
    const open = await runKeepSelection(text, true);
    assert.deepEqual(open.ids, expectedTail);
    assert.notEqual(open.view, 'ai');
    // the Save path (discuss false) is untouched by every mutant
    const save = await runKeepSelection(text, false);
    assert.deepEqual(save.ids, ['enter', 'serial', 'a-module', 'a-context', 'a-source', 'commit', 'branch', 'else']);
  });
}

/* ---------------------------------------------------------------- successor (publisher-context-probes/2, key 4c0e58f5) */
// The corrected renderer (7062ae8e) is read two ways: the whole corridor blob from git, for anchors and the probe-only
// inversion, and the fixture's exact extracted renderer, run in a sandbox with its own unchanged handlers.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { SUCCESSOR_PROBES, SUCCESSOR_EVENT_PROBES, SUCCESSOR_PROBE_VERSION, SUCCESSOR_EVENT_PROBE_VERSION, EVENT_PROBE_VERSION,
  successorRendererText } from './publisher-context-probes.mjs';

const sha = (text) => createHash('sha256').update(text).digest('hex');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/publisher-context-status-7062.json', import.meta.url), 'utf8'));
const blob = execFileSync('git', ['show', `${fixture.sourceHead}:${fixture.path}`],
  { cwd: new URL('.', import.meta.url), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const excerpt = fixture.excerpt;

test('successor fixture: the exact 7062 renderer, extracted from the accepted corridor blob at its recorded boundaries', () => {
  assert.equal(fixture.sourceHead, '7062ae8e29bb770934a46650a3e5c71feb01849c');
  assert.equal(sha(blob), 'fa9e56582baf464a4bd8f47fc878f797c7e5a46bcc4f2c637d09720e8ffd0f8f', 'the actual complete target blob');
  assert.equal(fixture.corridorSha256, sha(blob));
  assert.equal(sha(excerpt), fixture.excerptSha256);
  assert.equal(blob.slice(fixture.extraction.startOffset, fixture.extraction.endOffset), excerpt);
  assert.equal(successorRendererText(blob), excerpt);
  assert.equal(sha(source), fixture.legacy.corridorSha256, 'the version-1 input in this branch is the frozen baseline');
  const oldRenderer = successorRendererText(source);
  assert.notEqual(oldRenderer, excerpt, 'the baseline holds the older renderer body');
  assert.throws(() => applyProbes(oldRenderer, { successor: true }), /probe enter: anchor occurs 0 times/);
  assert.throws(() => successorRendererText(`${blob}\n${fixture.extraction.startMarker}`), /exactly once/);
});

test('successor anchors are exact-once in the whole 7062 blob and in the extracted renderer; missing, doubled and stale sources refuse', () => {
  for (const [label, text] of [['blob', blob], ['excerpt', excerpt]]) {
    for (const events of [false, true]) {
      const { applied } = applyProbes(text, { events, successor: true });
      assert.deepEqual(applied, ['version', ...SUCCESSOR_PROBES.map((p) => p.id), ...(events ? SUCCESSOR_EVENT_PROBES.map((p) => p.id) : [])], label);
    }
    for (const probe of [...SUCCESSOR_PROBES, ...SUCCESSOR_EVENT_PROBES]) {
      assert.throws(() => applyProbes(text.replace(probe.from, ''), { events: true, successor: true }), new RegExp(`probe ${probe.id}: anchor occurs 0 times`), `${label} ${probe.id}`);
      assert.throws(() => applyProbes(`${text}\n${probe.from}`, { events: true, successor: true }), new RegExp(`probe ${probe.id}: anchor occurs 2 times`), `${label} ${probe.id}`);
    }
  }
  assert.throws(() => applyProbes(source, { successor: true }), /probe enter: anchor occurs 0 times/, 'successor on the frozen baseline');
  assert.throws(() => applyProbes(source, { events: true, successor: true }), /probe enter: anchor occurs 0 times/);
  assert.throws(() => applyProbes(blob), /probe enter: anchor occurs 0 times/, 'version 1 on the corrected renderer');
  assert.throws(() => applyProbes(blob, { events: true }), /probe enter: anchor occurs 0 times/);
});

test('successor probe-only inversion is byte-exact in both modes; modes, versions and double application never mix', () => {
  for (const text of [blob, excerpt]) {
    for (const events of [false, true]) {
      const { source: served } = applyProbes(text, { events, successor: true });
      const line = `window.__ctxDiagVersion = ${JSON.stringify(events ? SUCCESSOR_EVENT_PROBE_VERSION : SUCCESSOR_PROBE_VERSION)};\n`;
      assert.ok(served.startsWith(line) && served.split(line).length === 2);
      assert.equal(probeOnlyDiff(text, served, { events, successor: true }), true);
      assert.equal(probeOnlyDiff(text, served, { events: !events, successor: true }), false, 'the other mode');
      assert.equal(probeOnlyDiff(text, served, { events }), false, 'read as version 1');
      assert.equal(probeOnlyDiff(text, served.replace("'Opening selected text…'", "'Opening…'"), { events, successor: true }), false, 'a non-probe edit');
      assert.throws(() => applyProbes(served, { events, successor: true }), /already present|anchor occurs/, 'double application');
    }
  }
  const legacyServed = applyProbes(source, { events: true }).source;
  assert.equal(sha(legacyServed), 'd8eec25bc84ebac1ebc21870695a23fc0ccd92bc636f17cbd6062465423cc3ef', 'version 1 events bytes unchanged');
  assert.equal(sha(applyProbes(source).source), 'b8592e3d2340b7565d47af44eae83690b7eabeed8fba05c428fcd9e64c096809', 'version 1 context bytes unchanged');
  assert.equal(EVENT_PROBE_VERSION, 'publisher-context-probes/1+events/2', 'the EV4 recorder\'s imported version is untouched');
  // prospective only: these become runtime pins only from a separately built and admitted repaired artifact
  assert.equal(sha(applyProbes(blob, { successor: true }).source), '63c9bebaf17e7720e2c2fbe16e019706294d66cf8e339b7ac5546bce3c5480ed');
  assert.equal(sha(applyProbes(blob, { events: true, successor: true }).source), 'e0e8df4f6e2d60f083078e44e33590bfa80de5d74a3fcd97fcdca75454fd515d');
});

test('successor records name only what is in scope: no bare pending, and discuss only inside keepSelection', () => {
  for (const probe of [...SUCCESSOR_PROBES, ...SUCCESSOR_EVENT_PROBES]) {
    assert.doesNotMatch(probe.text, /(^|[^.\w])pending\b/u, `${probe.id} has no bare pending`);
    assert.match(probe.text, /^\s*try \{|^\s*try \{.*\}\s*catch \{\}/u, `${probe.id} is guarded`);
    if (probe.id !== 'enter' && probe.id !== 'reg-open') assert.doesNotMatch(probe.text, /\bdiscuss\b/u, `${probe.id} has no discuss`);
  }
});

/** The corrected renderer run as the page runs it: its own begin/classify/finish/keepSelection closures and its own Open,
 * Save, practice and lookup handlers, over a minimal DOM. Only the app's outside world is stubbed. */
function rendererSandbox(rendererText, { personal = false, commit = async () => true, resolve = async () => {} } = {}) {
  let ids = 0;
  const make = (tag, cls = '', text = '') => ({ tag, className: cls, textContent: text, id: '', hidden: false, disabled: false, type: '',
    dataset: {}, children: [], parent: null, attrs: {}, listeners: {}, root: false,
    setAttribute(key, value) { this.attrs[key] = String(value); },
    append(...kids) { for (const kid of kids) { kid.parent = this; this.children.push(kid); } },
    prepend(...kids) { for (const kid of [...kids].reverse()) { kid.parent = this; this.children.unshift(kid); } },
    replaceChildren(...kids) { this.children = []; this.append(...kids); },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    contains(other) { for (let node = other; node; node = node.parent) if (node === this) return true; return false; },
    get isConnected() { for (let node = this; node; node = node.parent) if (node.root) return true; return false; } });
  const text = '町の話をする';
  const saved = { receiptSha256: 'receipt-1', id: 'capture-1', encounterUrl: 'https://example.test/a',
    candidate: { article: { body: { text, contentSha256: 'digest-1' }, title: 'title', source: { attribution: 'attr' },
      canonicalUrl: 'https://example.test/a', capabilities: { 'quote-extract': { status: 'allowed' } } } } };
  const page = make('div'); page.root = true;
  const main = make('main'), body = make('div', 'body', text);
  page.append(main, body);
  const calls = { commits: 0, searches: 0, renders: 0 };
  const sandbox = {
    window: { __ctxDiag: [], scrollY: 0, scrollTo() {}, getSelection: () => null,
      __diagId: (node) => (node ? (node.__id ||= ++ids) : null), __diagEventId: (event) => event.__eventId ?? null },
    performance: { now: () => 0 }, document: { createRange: () => ({ selectNodeContents() {} }) },
    S: { view: personal ? 'source-reader' : 'publisher', publisherReceipt: saved.receiptSha256, sourceCaptureId: saved.id, stack: [], sourceInbox: {} },
    recordEpoch: 1, pageEpoch: 1, AI_CHAT_PAGE: 3, writable: true,
    el: make, biLabel: (tag, cls, ja, en) => make(tag, cls, en), tx: (ja, en) => en,
    declineWrite: (reason) => Object.assign(new Error(reason), { code: reason }), teacherSourceError: () => 'source error',
    saveOne: (options) => Object.assign(make('button', options.cls), { id: options.id, keep: options.keep }),
    paintWordSave() {}, copyReaderText() {}, keepScroll() {}, stopReadAloud() {}, appendTranscriptTime() {}, appendFileSourceRange() {},
    render() { calls.renders++; }, openSearchPage() { calls.searches++; },
    ensureTeacherContextModule: async () => ({ digestText: async () => 'digest', createTeacherContext: async (fields) => ({ ...fields }),
      selectTeacherContext: (root, context) => ({ context }), activateTeacherContext: (root) => root }),
    teacherContextModule: { sourceSentenceContext: async (context, whole) => ({ start: 0, text: whole }) },
    sentencePracticeModule: {},
    sourceInboxModule: { selectSourceCapture: () => saved, selectListeningTranscript: () => null, selectFileCapture: () => null },
    publisherModule: { selectPublisherReading: () => saved },
    resolveTeacherSource: (context) => resolve(sandbox, context),
    commitStorePatch: async (producer) => { calls.commits++; const ok = await commit(sandbox); if (ok) producer({ teacherContexts: {}, publisherLibrary: {}, sourceInbox: {} }); return ok; },
  };
  sandbox.recordWritable = () => sandbox.writable;
  vm.createContext(sandbox);
  vm.runInContext(`var publisherSelectionSurface = null; var teacherContextSelectionSerial = 0;\n${rendererText}\n` +
    'globalThis.__render = renderTextSourceContextSelection;', sandbox);
  const find = (id, node = main) => node.id === id ? node : node.children.reduce((hit, kid) => hit || find(id, kid), null);
  const prefix = personal ? 'source' : 'publisher';
  const api = { sandbox, calls, main,
    render() { main.children = []; sandbox.__render(main, saved, body, personal); return api; },
    select(quote) { const start = text.indexOf(quote); sandbox.publisherSelectionSurface.state.selection = { start, end: start + quote.length, quote }; return api; },
    button: (name) => find({ open: `${prefix}-context-open`, save: `${prefix}-context-save`, practice: `${prefix}-sentence-practice`, lookup: 'source-selection-lookup' }[name]),
    click(name, eventId = `event-${name}`) {
      const node = api.button(name);
      if (name === 'save') return node.keep();
      for (const fn of node.listeners.click) fn.call(node, { currentTarget: node, target: node, isTrusted: true, eventPhase: 2, __eventId: eventId });
    },
    settle: async () => { for (let i = 0; i < 4; i++) await new Promise((done) => setTimeout(done, 0)); },
    rows: () => Array.from(sandbox.window.__ctxDiag, ({ t, ...row }) => row),
  };
  return api.render();
}
const probedRenderer = applyProbes(excerpt, { events: true, successor: true }).source;
const ids = (rows) => rows.map((row) => row.id);

test('actual renderer, Open success: listener-open joins its trusted event to enter, then commit, outcome opened and finish', async () => {
  const page = rendererSandbox(probedRenderer).select('町');
  assert.deepEqual(ids(page.rows()), ['render', 'reg-save', 'reg-open']);
  page.sandbox.window.__ctxDiag.length = 0;
  page.click('open', 'event-41');
  await page.settle();
  const rows = page.rows();
  assert.deepEqual(ids(rows), ['listener-open', 'enter', 'commit', 'outcome', 'finish']);
  assert.deepEqual([rows[0].event, rows[0].trusted, rows[0].node === rows[0].current], ['event-41', true, true], 'the trusted action\'s private event id');
  assert.deepEqual(rows[1], { id: 'enter', discuss: true, begun: true, generation: 1, serial: 1, refused: null, serialNow: 1 });
  assert.deepEqual(rows[3], { id: 'outcome', kind: 'open', code: 'opened', generation: 1, serial: 1, serialNow: 1, ownsPending: true });
  assert.deepEqual(rows[4], { id: 'finish', kind: 'open', outcome: 'opened', reason: null, ownsPendingBeforeFinish: true });
  assert.equal(page.sandbox.S.view, 'ai');
});

test('actual renderer, O5 and O8: classify sees both, finish sees the final outcome, and Open never navigates', async () => {
  const o5 = rendererSandbox(probedRenderer, { commit: async () => false }).select('町');
  o5.click('open'); await o5.settle();
  assert.deepEqual(o5.rows().filter((row) => ['outcome', 'finish'].includes(row.id)).map((row) => row.code ?? row.outcome), ['O5', 'O5']);
  assert.equal(o5.sandbox.S.view, 'publisher');
  const o8 = rendererSandbox(probedRenderer, { resolve: async (sandbox) => { sandbox.teacherContextSelectionSerial++; } }).select('町');
  o8.click('open'); await o8.settle();
  const rows = o8.rows();
  assert.ok(!ids(rows).includes('commit'), 'a newer Open took over before the save');
  assert.deepEqual(rows.filter((row) => row.id === 'outcome').map((row) => row.code), ['O8', 'O8'], 'requireOwner, then failed');
  assert.deepEqual(rows.find((row) => row.id === 'finish'), { id: 'finish', kind: 'open', outcome: 'O8', reason: 'O8', ownsPendingBeforeFinish: true });
  assert.equal(o8.sandbox.S.view, 'publisher');
});

test('actual renderer, begin refusals O1 and O3 are enter.refused only: no classify, commit or finish', async () => {
  const none = rendererSandbox(probedRenderer);
  none.click('open'); await none.settle();
  const r1 = none.rows().filter((row) => !['render', 'reg-save', 'reg-open'].includes(row.id));
  assert.deepEqual(ids(r1), ['listener-open', 'enter']);
  assert.deepEqual([r1[1].begun, r1[1].refused, r1[1].generation], [false, 'O1', null]);
  const readOnly = rendererSandbox(probedRenderer).select('町');
  readOnly.sandbox.writable = false;
  readOnly.click('open'); await readOnly.settle();
  assert.deepEqual(readOnly.rows().filter((row) => row.id === 'enter').map((row) => row.refused), ['O3']);
  assert.ok(!ids(readOnly.rows()).some((id) => ['outcome', 'commit', 'finish'].includes(id)));
});

test('actual renderer, Save, practice and lookup: each kind is classified by its own handler; enter and commit belong to keepSelection only', async () => {
  const save = rendererSandbox(probedRenderer).select('町');
  save.sandbox.window.__ctxDiag.length = 0;
  assert.equal(await save.click('save'), true);
  assert.deepEqual(ids(save.rows()), ['enter', 'commit', 'outcome', 'finish']);
  assert.deepEqual([save.rows()[0].discuss, save.rows()[0].serial, save.rows()[2].code], [false, null, 'saved']);
  const practice = rendererSandbox(probedRenderer).select('町');
  practice.sandbox.window.__ctxDiag.length = 0;
  practice.click('practice'); await practice.settle();
  assert.deepEqual(practice.rows().map((row) => [row.id, row.kind, row.code ?? row.outcome]), [['outcome', 'practice', 'practice'], ['finish', 'practice', 'practice']]);
  assert.equal(practice.sandbox.S.view, 'sentence-practice');
  const lookup = rendererSandbox(probedRenderer, { personal: true }).select('町');
  lookup.sandbox.window.__ctxDiag.length = 0;
  lookup.click('lookup'); await lookup.settle();
  assert.deepEqual(lookup.rows().map((row) => [row.id, row.kind, row.code ?? row.outcome]), [['outcome', 'lookup', 'lookup'], ['finish', 'lookup', 'lookup']]);
  assert.equal(lookup.calls.searches, 1);
});

test('actual renderer, surface replaced mid-save: the assignment is not a classify; the eventual finish sees surface-replaced', async () => {
  let release;
  const page = rendererSandbox(probedRenderer, { commit: () => new Promise((done) => { release = done; }) }).select('町');
  page.click('open'); await page.settle();
  assert.equal(typeof release, 'function', 'the save is in flight');
  page.render();
  release(true); await page.settle();
  const finish = page.rows().filter((row) => row.id === 'finish');
  assert.deepEqual(finish.map((row) => row.outcome), ['surface-replaced']);
  assert.equal(page.sandbox.S.view, 'publisher', 'a replaced surface never opens');
});

test('the probes change nothing the app does: unprobed rows are empty, outcomes match, and a failing diagnostic array is harmless', async () => {
  for (const [label, text, poison] of [['unprobed', excerpt, false], ['probed', probedRenderer, false], ['probed, telemetry throwing', probedRenderer, true]]) {
    const page = rendererSandbox(text).select('町');
    if (poison) Object.defineProperty(page.sandbox.window, '__ctxDiag', { get() { throw new Error('telemetry down'); }, configurable: true });
    page.click('open'); await page.settle();
    assert.deepEqual([page.sandbox.S.view, page.calls.commits, page.calls.renders], ['ai', 1, 1], label);
    if (!poison && text === excerpt) assert.deepEqual(page.rows(), [], 'the unprobed renderer records nothing');
  }
});

test('inverse: the frozen bare-pending record genuinely fails at the same anchor, and an out-of-scope discuss drops its rows', async () => {
  const enter = SUCCESSOR_PROBES.find((probe) => probe.id === 'enter');
  const frozen = '    (window.__ctxDiag ||= []).push({ id: "enter", t: performance.now(), discuss, serialNow: teacherContextSelectionSerial, pending });\n';
  // harness copies only: the Open listener hands back keepSelection's promise instead of discarding it, in both runs alike
  const expose = (text) => text.replace('void keepSelection(true, openSaved);', () => 'globalThis.__open = keepSelection(true, openSaved);');
  const broken = rendererSandbox(expose(excerpt.replace(enter.from, () => enter.from + frozen))).select('町');
  broken.click('open');
  const failure = await broken.sandbox.__open.then(() => null, (error) => error);
  assert.equal(failure?.name, 'ReferenceError', 'the frozen text throws when it runs');
  assert.match(String(failure?.message), /pending is not defined/);
  assert.equal(broken.sandbox.S.view, 'publisher');
  const fixed = rendererSandbox(expose(applyProbes(excerpt, { successor: true }).source)).select('町');
  fixed.click('open');
  assert.equal(await fixed.sandbox.__open, true, 'the corrected text at the same anchor runs the Open to the end');
  assert.deepEqual([fixed.rows()[0].id, fixed.sandbox.S.view], ['enter', 'ai']);
  const outcome = SUCCESSOR_PROBES.find((probe) => probe.id === 'outcome');
  const scoped = rendererSandbox(applyProbes(excerpt, { successor: true }).source.replace(outcome.text, () => outcome.text.replace('kind: operation.kind', 'kind: discuss'))).select('町');
  scoped.click('open'); await scoped.settle();
  assert.ok(!ids(scoped.rows()).includes('outcome'), 'a guarded out-of-scope name is caught by the missing rows, not hidden');
  assert.equal(scoped.sandbox.S.view, 'ai', 'and still never changes the app');
});

test('version-1 helpers refuse the corrected renderer: old mutants and keepSelectionText are never successor proof', () => {
  const served = applyProbes(blob, { events: true, successor: true }).source;
  for (const name of Object.keys(MUTANTS)) assert.throws(() => applyMutant(served, name), /context mutants apply only to publisher-context-probes\/1 sources/, name);
  assert.throws(() => applyMutant(excerpt, 'x-guard'), /apply only to/);
  assert.throws(() => keepSelectionText(blob), /harness; the corrected renderer is not its input/);
  assert.equal(typeof applyMutant(applyProbes(source).source, 'x-guard'), 'string', 'on their own frozen input they still apply');
  assert.equal(keepSelectionText(source).startsWith('  const keepSelection = async (discuss, control) => {'), true);
});
