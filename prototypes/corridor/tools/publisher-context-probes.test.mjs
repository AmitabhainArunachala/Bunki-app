// Node-side controls for the diagnostic-only saved-context probes (window 4 slot 1, lead 1643):
// anchors exact-once, a probe-only diff, and exit labelling — each mutant must make the real probed
// keepSelection, run in a sandbox, name exactly its own exit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { PROBES, MUTANTS, applyProbes, applyMutant, probeOnlyDiff, keepSelectionText } from './publisher-context-probes.mjs';

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
  assert.deepEqual(applied, PROBES.map((probe) => probe.id));
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
