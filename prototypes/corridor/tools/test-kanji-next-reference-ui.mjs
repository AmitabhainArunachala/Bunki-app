/**
 * K02 source-only adapter tests. Lift the actual corridor functions with the
 * TypeScript AST; use the real reference core, validator/cache and committed
 * data. The small DOM records text, attributes and callbacks only. This is not
 * browser, layout, navigation or native-gate evidence.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('../corridor.js');
const coreSource = read('../reference-core.js');
const coreContext = { module: { exports: {} } };
vm.runInNewContext(coreSource, coreContext, { filename: 'reference-core.js' });
const core = coreContext.module.exports;
const ast = ts.createSourceFile('corridor.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
assert.equal(ast.parseDiagnostics.length, 0, 'Actual corridor source must parse');
const inputTexts = Object.fromEntries(['kanji', 'strokes', 'radicals214', 'reference-extra']
  .map(name => [name, read(`../data/share_alike/${name}.json`)]));
const canonical = JSON.parse(inputTexts.kanji).kanji;
const strokeData = JSON.parse(inputTexts.strokes).strokes;
const radicalInfo = JSON.parse(inputTexts.radicals214);
const extra = JSON.parse(inputTexts['reference-extra']);
console.log('source-only input SHA256', JSON.stringify(Object.fromEntries(
  Object.entries({ 'corridor.js': source, 'reference-core.js': coreSource, ...inputTexts })
    .map(([name, text]) => [name, createHash('sha256').update(text).digest('hex')]),
)));
const plain = value => JSON.parse(JSON.stringify(value));
const declarations = [
  'el', 'bi', 'tx', 'biLabel',
  'plainRecord', 'finiteNumber', 'nonEmptyString', 'safeJsonValue', 'validKanjiRecord', 'retainedKanjiRecord',
  'referenceLibrary', 'referenceExtraError', 'referenceExtraPending', 'referenceExtraTask', 'loadReferenceExtra',
  'kanjiReferenceIndexFor', 'kanjiReferenceIndex', 'kanjiReferenceRows',
  'kanjiReadingsState', 'kanjiFactsState', 'kanjiFacts', 'kanjiReferenceView', 'kanjiFactsStatus',
  'kanjiReference', 'kanjiFinderUniverse', 'kanjiDisplayRecord', 'kanjiEntryRecord', 'strokeRoomRecord',
  'classicalRadicalHits', 'kdxRadicalResults', 'kdxTextResults',
  'kdxGridShown', 'kdxGlyphName', 'renderKdxGrid',
  'strokeClassificationLine', 'strokeReferenceStatus', 'strokeClassicReadings',
  'strokeReadingField', 'refreshStrokeReadings', 'strokeReadingsStatus', 'strokeReadingRow',
  'displayKunReading', 'strokePathsFor',
];
const namesOf = statement => ts.isFunctionDeclaration(statement) ? [statement.name?.text]
  : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map(node => node.name.getText(ast)) : [];
const selected = ast.statements.filter(statement => namesOf(statement).some(name => declarations.includes(name)));
const found = selected.flatMap(namesOf);
for (const name of declarations) assert.equal(found.filter(item => item === name).length, 1, `Lift exactly one ${name}`);

function lifted(control = null) {
  return selected.map(statement => {
    let text = statement.getText(ast);
    if (control && namesOf(statement).includes(control.function)) {
      assert.equal(text.split(control.from).length, 2, `Negative control must match once: ${control.function}`);
      text = text.replace(control.from, control.to);
    }
    return text;
  }).join('\n');
}

function visit(node) {
  return [node, ...node.children.flatMap(visit)];
}
function matches(node, selector) {
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('.')) return node.className.split(/\s+/u).includes(selector.slice(1));
  const attribute = selector.match(/^\[([^\]=]+)(?:="([^"]*)")?\]$/u);
  if (attribute) {
    const [, name, value] = attribute;
    const key = name.startsWith('data-') ? name.slice(5).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase()) : null;
    const record = key === null ? node.attributes : node.dataset;
    const field = key ?? name;
    return Object.hasOwn(record, field) && (value === undefined || record[field] === value);
  }
  throw new Error(`Minimal test DOM does not implement selector ${selector}`);
}
function query(root, selector, includeRoot = false) {
  const alternatives = selector.split(',').map(item => item.trim().split(/\s+(?:>\s+)?/u));
  return visit(root).filter(node => (includeRoot || node !== root) && alternatives.some(parts => {
    if (!matches(node, parts.at(-1))) return false;
    let ancestor = node.parentNode;
    for (let index = parts.length - 2; index >= 0; index--) {
      while (ancestor && !matches(ancestor, parts[index])) ancestor = ancestor.parentNode;
      if (!ancestor) return false;
      ancestor = ancestor.parentNode;
    }
    return true;
  }));
}
class TextElement {
  constructor(document, tag) {
    this.ownerDocument = document;
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.events = {};
    this.parentNode = null;
    this.className = '';
    this._text = '';
  }
  set textContent(value) {
    this.children.forEach(child => { child.parentNode = null; });
    this.children = [];
    this._text = String(value ?? '');
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...nodes) {
    for (let node of nodes) {
      if (typeof node === 'string') {
        const text = new TextElement(this.ownerDocument, '#text');
        text.textContent = node;
        node = text;
      }
      node.parentNode = this;
      this.children.push(node);
    }
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { this.events[name] = callback; }
  querySelector(selector) { return query(this, selector)[0] || null; }
  querySelectorAll(selector) { return query(this, selector); }
  contains(node) { return visit(this).includes(node); }
  focus() { this.ownerDocument.activeElement = this; }
  replaceChildren(...nodes) { this.textContent = ''; this.append(...nodes); }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this);
    this.parentNode = null;
  }
  replaceWith(next) {
    if (this.ownerDocument.root === this) this.ownerDocument.root = next;
    else if (this.parentNode) {
      const parent = this.parentNode;
      parent.children[parent.children.indexOf(this)] = next;
      next.parentNode = parent;
    }
    this.parentNode = null;
  }
  get isConnected() {
    let top = this.parentNode;
    if (!top) return this.ownerDocument.root === this;
    while (top.parentNode) top = top.parentNode;
    return this.ownerDocument.root === top;
  }
}

function app({ supplement = extra, pending = false, error = null, state = {}, control = null } = {}) {
  const document = {
    root: null,
    activeElement: null,
    createElement(tag) { return new TextElement(this, tag); },
    createTextNode(text) { const node = new TextElement(this, '#text'); node.textContent = text; return node; },
    getElementById(id) { return this.root ? visit(this.root).find(node => node.id === id) || null : null; },
    querySelector(selector) { return this.root ? query(this.root, selector, true)[0] || null : null; },
  };
  const D = { kanji: canonical, strokes: strokeData, radInfo: radicalInfo, referenceExtra: supplement };
  const S = { lang: 'bi', kdx: {}, taken: [], stack: [], srs: {}, revlog: [], obslog: [], stats: {}, ...state };
  const timers = new Map();
  let nextTimer = 0;
  const context = vm.createContext({
    D, S, document, window: { BunkiReferenceCore: core },
    // Typography/layout and transport are outside this pure adapter contract.
    jaFlow: () => false, placesLayout: () => false,
    go: node => { context.lastOpened = plain(node); },
    AbortController,
    setTimeout: (callback, milliseconds) => { timers.set(++nextTimer, { callback, milliseconds }); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    fetch: () => { throw new Error('This test has no transport'); },
    render: () => { throw new Error('Unexpected full-room redraw'); },
    renderStrokePage: () => { throw new Error('Unexpected ink room replacement'); },
    mountInkRoom: () => { throw new Error('Unexpected ink engine start'); },
    stopInkRoom: () => { throw new Error('Unexpected ink engine stop'); },
  });
  const runtime = vm.runInContext(`${lifted(control)}
    ({
      kanjiFactsState, kanjiFacts, kanjiReferenceView, classicalRadicalHits,
      kdxRadicalResults, kdxTextResults, kanjiFactsStatus,
      retainedKanjiRecord, validKanjiRecord, kanjiDisplayRecord, kanjiEntryRecord, strokeRoomRecord,
      loadReferenceExtra, strokeClassificationLine, strokeReferenceStatus, strokeClassicReadings,
      strokeReadingField, refreshStrokeReadings,
      setReference(value, pending, error) {
        D.referenceExtra = value;
        referenceExtraPending = pending;
        referenceExtraError = error;
      }
    });`, context);
  runtime.setReference(supplement, pending, error);
  return {
    runtime, D, S, document, context, timers,
    mount(node) { document.root = node; return node; },
    meaning(query) { S.kdx.meaning = query; return this.mount(runtime.kdxTextResults('meaning')); },
    radical(value) { S.kdx.rad = value; return this.mount(runtime.kdxRadicalResults()); },
  };
}

const hits = root => visit(root).filter(node => node.dataset.kdxHit).map(node => node.dataset.kdxHit);
const states = root => visit(root).filter(node => node.dataset.kanjiFactsState);
const copyFacts = () => plain(extra);
const learnerBytes = state => JSON.stringify({
  taken: state.taken, srs: state.srs, revlog: state.revlog, obslog: state.obslog, stats: state.stats,
});
function savedRecord(literal = '頼') {
  const { release, archiveSha256, dictionaryDate, databaseVersion } = extra.audit.kanjiFacts;
  return {
    version: 1, c: literal, meanings: ['the learner’s retained answer'],
    on: ['ライ'], kun: ['たの.む'], st: canonical[literal].st, rad: canonical[literal].rad,
    sourceVersion: { schemaVersion: 1, release, archiveSha256, dictionaryDate, databaseVersion },
  };
}

test('actual facts adapter distinguishes pending, failed, valid absent and complete using the real validator/cache', () => {
  assert(core.validateKanjiFacts(extra));
  const a = app({ supplement: null });
  assert.equal(a.runtime.kanjiFactsState(), 'pending');
  assert.equal(a.runtime.kanjiFacts('酒'), null);
  a.runtime.setReference(null, false, new Error('unavailable'));
  assert.equal(a.runtime.kanjiFactsState(), 'failed');
  a.runtime.setReference(null, true, new Error('previous failure'));
  assert.equal(a.runtime.kanjiFactsState(), 'pending', 'A retry is not the old failure');

  const invalid = copyFacts();
  invalid.audit.kanjiFacts.archiveSha256 = '0'.repeat(64);
  a.runtime.setReference(invalid, false, null);
  assert.equal(a.runtime.kanjiFactsState(), 'failed');
  assert.equal(a.runtime.kanjiFacts('酒'), null);
  assert.equal(a.runtime.kanjiReferenceView('酒', canonical.酒).state, 'failed');
  // Replace the immutable object, as the real successful loader does.
  a.runtime.setReference(extra, false, null);
  assert.equal(a.runtime.kanjiFactsState(), 'complete');
  assert.equal(a.runtime.kanjiReferenceView('劦', canonical.劦).state, 'absent');
  assert.equal(a.runtime.kanjiFacts('劦'), null);
  assert.equal(a.runtime.kanjiFacts('𠮟').referenceSource.sourceId, '𠮟');
  assert.equal(a.runtime.kanjiFacts('森木'), null);
});

test('actual reference view preserves full meanings and named classical/Nelson source without rewriting legacy answers', () => {
  const before = JSON.stringify(canonical);
  const a = app();
  assert.deepEqual(plain(a.runtime.kanjiFacts('酒').radicalSchemes), { classical: 164, nelson: 85 });
  assert.deepEqual(plain(a.runtime.kanjiFacts('頼').radicalSchemes), { classical: 181, nelson: null });
  assert.equal(canonical.頼.rad, 154);
  for (const [literal, meanings] of [
    ['月', ['month', 'moon']], ['楽', ['music', 'comfort', 'ease']], ['頼', ['trust', 'request']],
  ]) {
    const result = a.runtime.kanjiReferenceView(literal, canonical[literal]);
    assert.deepEqual(plain(result.meanings), meanings);
    assert.equal(result.state, 'complete');
    assert.equal(result.referenceSource.sourceId, literal);
    assert.equal(result.referenceSource.archiveSha256, extra.audit.kanjiFacts.archiveSha256);
    assert.equal(result.referenceSource.release, extra.audit.kanjiFacts.release);
    result.meanings[0] = 'caller changed copy';
    result.radicalSchemes.classical = 1;
    assert.deepEqual(plain(a.runtime.kanjiReferenceView(literal).meanings), meanings);
  }
  assert.equal(JSON.stringify(canonical), before);
});

function assertClassical(a) {
  assert(a.runtime.classicalRadicalHits(164).includes('酒'));
  assert(!a.runtime.classicalRadicalHits(85).includes('酒'));
  assert(a.runtime.classicalRadicalHits(181).includes('頼'));
  assert(!a.runtime.classicalRadicalHits(154).includes('頼'));
}
test('actual classical finder and rendered hit actions use classical facts, never legacy/Nelson membership', () => {
  const a = app();
  assertClassical(a);
  const result = a.radical(164);
  assert(hits(result).includes('酒'));
  const button = visit(result).find(node => node.dataset.kdxHit === '酒');
  assert.equal(button.dataset.rad, '164');
  button.events.click();
  assert.deepEqual(a.context.lastOpened, { t: 'kanji', id: '酒' });
  assert(result.textContent.includes('Dictionary classification'));
});

function assertMeaningSearch(a) {
  for (const [query, literal] of [['moon', '月'], ['comfort', '楽'], ['request', '頼']]) {
    const result = a.meaning(query);
    assert(hits(result).includes(literal), `${query} must find ${literal} through actual UI lookup`);
    const button = visit(result).find(node => node.dataset.kdxHit === literal);
    assert(button.attributes['aria-label'].includes(query), `${literal}: accessible meaning includes full source sense`);
  }
}
test('actual meaning UI searches all source senses and preserves record roots', () => {
  const a = app({ state: { srs: { retained: { due: '2026-01-01' } }, revlog: [{ rating: 3 }] } });
  const before = learnerBytes(a.S);
  assertMeaningSearch(a);
  assert(hits(a.meaning('  MOON  ')).includes('月'));
  assert.equal(learnerBytes(a.S), before);
});

test('pending/failed lookup exposes uncertainty and retry; no radical results or definitive no-match claim', () => {
  for (const [state, options] of [
    ['pending', { supplement: null, pending: true }],
    ['failed', { supplement: null, error: new Error('fixture transport failed') }],
    ['failed', { supplement: { schemaVersion: 3 } }],
  ]) {
    const a = app(options);
    const radical = a.radical(154);
    assert.deepEqual(plain(a.runtime.classicalRadicalHits(154)), []);
    assert.equal(hits(radical).length, 0);
    assert(!visit(radical).some(node => Object.hasOwn(node.dataset, 'kdxCount')),
      'An unavailable classification must not display a zero classification count');
    assert.deepEqual(states(radical).map(node => node.dataset.kanjiFactsState), [state]);
    assert(states(radical).every(node => node.attributes.role === 'status'));
    assert(!radical.textContent.includes('No character matches'));
    const meaning = a.meaning('not-a-real-meaning-queried-by-this-test');
    assert.equal(hits(meaning).length, 0);
    assert.deepEqual(states(meaning).map(node => node.dataset.kanjiFactsState), [state]);
    assert(meaning.textContent.includes('lesson keywords only'), 'Any fallback count is explicitly scope-qualified');
    assert(!meaning.textContent.includes('No character matches'));
    assert.equal(visit(meaning).filter(node => node.id === 'kdx-meanings-retry').length, state === 'failed' ? 1 : 0);
  }
  const complete = app().meaning('not-a-real-meaning-queried-by-this-test');
  assert(complete.textContent.includes('No character matches'), 'A complete table may report a real miss');
});

test('actual loader and retry callback redraw the current query after validation without learner writes or network', async () => {
  const a = app({
    supplement: null, error: new Error('first load failed'),
    state: { ready: true, view: 'kanjidex' },
  });
  const before = learnerBytes(a.S);
  a.context.window.__CORRIDOR_BUNDLE__ = { 'share_alike/reference-extra': extra };
  const failed = a.meaning('moon');
  visit(failed).find(node => node.id === 'kdx-meanings-retry').events.click();
  assert.equal(states(a.document.root)[0].dataset.kanjiFactsState, 'pending');
  const first = a.runtime.loadReferenceExtra();
  assert.equal(a.runtime.loadReferenceExtra(), first, 'One in-flight load is shared');
  assert.equal(await first, extra);
  assert(hits(a.document.root).includes('月'), 'Actual loader completion refreshes the still-open pending query');
  assert.equal(states(a.document.root).length, 0);
  assert.equal(a.timers.size, 0, 'The real loader clears its timeout');
  assert.equal(learnerBytes(a.S), before);
});

test('actual loader refuses malformed data, keeps failure retryable, then validates a fresh immutable supplement', async () => {
  const a = app({ supplement: null });
  a.context.window.__CORRIDOR_BUNDLE__ = { 'share_alike/reference-extra': { schemaVersion: 3 } };
  assert.equal(await a.runtime.loadReferenceExtra(), null);
  assert.equal(a.D.referenceExtra, null);
  assert.equal(a.runtime.kanjiFactsState(), 'failed');
  assert.equal(a.timers.size, 0);
  a.context.window.__CORRIDOR_BUNDLE__ = { 'share_alike/reference-extra': extra };
  assert.equal(await a.runtime.loadReferenceExtra(), extra);
  assert.equal(a.runtime.kanjiFactsState(), 'complete');
  assert.equal(a.runtime.kanjiFacts('頼').radicalSchemes.classical, 181);
});

function assertRetained(a, snapshot) {
  assert(a.runtime.validKanjiRecord(snapshot, '頼'));
  for (const resolve of [a.runtime.retainedKanjiRecord, a.runtime.kanjiEntryRecord, a.runtime.strokeRoomRecord]) {
    const record = resolve('頼');
    assert.equal(record.m, snapshot.meanings.join('; '));
    assert.deepEqual(plain(record.on), snapshot.on);
    assert.deepEqual(plain(record.kun), snapshot.kun);
    assert.equal(record.rad, snapshot.rad);
    assert.deepEqual(plain(record.sourceVersion), snapshot.sourceVersion);
  }
}
test('saved entry and writing-room resolution preserve answer/readings/release while current reference expands separately', () => {
  for (const savedRelease of ['3.6.2+20260803141815', '3.6.1+20250101120000']) {
    const snapshot = savedRecord();
    snapshot.sourceVersion.release = savedRelease; // synthetic older retained release, not a new source claim
    const a = app({ state: {
      taken: [{ t: 'kanji', id: '頼', kanjiRecord: snapshot }],
      stack: [{ t: 'kanji', id: '頼', referenceEntry: { on: ['fake'], kun: ['fake'], meanings: ['fake'] } }],
    } });
    const before = learnerBytes(a.S);
    const canonicalBefore = JSON.stringify(canonical.頼);
    assertRetained(a, snapshot);
    const current = a.runtime.kanjiReferenceView('頼', a.runtime.kanjiEntryRecord('頼'));
    assert.deepEqual(plain(current.meanings), ['trust', 'request']);
    assert.equal(current.radicalSchemes.classical, 181);
    assert.equal(current.referenceSource.release, extra.audit.kanjiFacts.release);
    a.meaning('request');
    a.radical(181);
    assertRetained(a, snapshot);
    assert.equal(learnerBytes(a.S), before);
    assert.equal(JSON.stringify(canonical.頼), canonicalBefore);
  }
});

test('invalid retained identity is refused and unavailable facts never borrow a legacy radical as classification', () => {
  const snapshot = savedRecord();
  snapshot.c = '別';
  const a = app({ supplement: null, state: { taken: [{ t: 'kanji', id: '頼', kanjiRecord: snapshot }] } });
  assert.equal(a.runtime.retainedKanjiRecord('頼'), null);
  assert.equal(a.runtime.kanjiEntryRecord('頼').m, canonical.頼.m);
  const view = a.runtime.kanjiReferenceView('頼', canonical.頼);
  assert.equal(view.state, 'pending');
  assert.equal(view.radicalSchemes, undefined);
  assert.deepEqual(plain(view.meanings), [canonical.頼.m]);
});

test('writing classification follows the same source and omits a radical claim while facts are unavailable', () => {
  const a = app();
  const alcohol = a.runtime.strokeClassificationLine('酒', a.runtime.kanjiEntryRecord('酒'));
  assert(alcohol.includes(`classical radical ${radicalInfo[164].c} (KANJIDIC2)`));
  assert(!alcohol.includes(`classical radical ${radicalInfo[85].c}`));
  const trust = a.runtime.strokeClassificationLine('頼', a.runtime.kanjiEntryRecord('頼'));
  assert(trust.includes(`classical radical ${radicalInfo[181].c} (KANJIDIC2)`));
  assert(!trust.includes(`classical radical ${radicalInfo[154].c}`));
  for (const error of [null, new Error('fixture failure')]) {
    a.runtime.setReference(null, false, error);
    assert(!a.runtime.strokeClassificationLine('頼', canonical.頼).includes('radical'));
    const note = a.runtime.strokeReferenceStatus('頼', canonical.頼);
    assert.equal(states(note)[0].dataset.kanjiFactsState, error ? 'failed' : 'pending');
    assert(note.textContent.includes('lesson keywords'));
    assert(!note.textContent.includes('Meanings and classification — KANJIDIC2'));
  }
});

test('writing provenance says saved only for a valid retained answer, not an unsaved sourceVersion record', () => {
  const snapshot = savedRecord();
  const unsaved = app();
  const unsavedStatus = unsaved.runtime.strokeReferenceStatus('頼', snapshot).textContent;
  const unsavedReadings = unsaved.runtime.strokeReadingField(snapshot).textContent;
  assert(unsavedStatus.includes('Dictionary readings — KANJIDIC2'));
  assert(unsavedReadings.includes('Dictionary readings — KANJIDIC2'));
  assert(!unsavedStatus.includes('saved answer'));
  assert(!unsavedReadings.includes('Saved readings'));
  const saved = app({ state: { taken: [{ t: 'kanji', id: '頼', kanjiRecord: snapshot }] } });
  const record = saved.runtime.kanjiEntryRecord('頼');
  assert(saved.runtime.strokeReferenceStatus('頼', record).textContent.includes('Readings and saved answer — KANJIDIC2'));
  assert(saved.runtime.strokeReadingField(record).textContent.includes('Saved readings — KANJIDIC2'));
  assert(saved.runtime.strokeClassicReadings(record).textContent.includes('ライ'));
  assert(!saved.runtime.strokeClassicReadings(record).textContent.includes('キュウ'));
  assertRetained(saved, snapshot);
});

test('actual loader updates classic writing labels/status in place while preserving the page, ink sentinel and record', async () => {
  const a = app({
    supplement: null,
    state: { ready: true, view: 'kanji', strokes: { id: '頼', step: 4 }, strokeMinimal: false },
  });
  const page = a.document.createElement('section');
  page.id = 'stroke-page';
  const ink = a.document.createElement('canvas');
  ink.id = 'actual-ink-node-sentinel';
  ink.retainedGeometry = [1, 2, 3];
  const record = a.runtime.kanjiEntryRecord('頼');
  const meta = a.document.createElement('span');
  meta.className = 'stroke-k-meta';
  meta.textContent = a.runtime.strokeClassificationLine('頼', record);
  const meaning = a.document.createElement('span');
  meaning.className = 'stroke-meta-mean';
  meaning.textContent = record.m;
  const status = a.runtime.strokeReferenceStatus('頼', record);
  page.append(ink, meta, meaning, a.runtime.strokeClassicReadings(record), status);
  a.mount(page);
  status.focus();
  const before = learnerBytes(a.S);
  const strokeBefore = JSON.stringify(a.S.strokes);
  a.context.window.__CORRIDOR_BUNDLE__ = { 'share_alike/reference-extra': extra };
  await a.runtime.loadReferenceExtra();
  assert.equal(a.document.root, page);
  assert.equal(a.document.getElementById('actual-ink-node-sentinel'), ink);
  assert.deepEqual(ink.retainedGeometry, [1, 2, 3]);
  assert(meta.textContent.includes(`classical radical ${radicalInfo[181].c}`));
  assert.equal(meaning.textContent, 'trust; request');
  assert.equal(states(page).length, 0);
  assert(page.querySelector('.stroke-reference-status').textContent.includes('Meanings and classification — KANJIDIC2'));
  assert.equal(a.document.activeElement, page.querySelector('.stroke-reference-status'));
  assert.equal(learnerBytes(a.S), before);
  assert.equal(JSON.stringify(a.S.strokes), strokeBefore);
});

test('quiet writing refresh replaces only its reading field and preserves ink and retained readings', () => {
  const snapshot = savedRecord();
  const a = app({
    supplement: null,
    state: { strokes: { id: '頼', step: 3 }, taken: [{ t: 'kanji', id: '頼', kanjiRecord: snapshot }] },
  });
  const page = a.document.createElement('section');
  page.id = 'stroke-page';
  const ink = a.document.createElement('canvas');
  const awake = a.document.createElement('section');
  awake.id = 'stroke-awake-field';
  const oldField = a.runtime.strokeReadingField(a.runtime.kanjiEntryRecord('頼'));
  awake.append(oldField);
  page.append(ink, awake);
  a.mount(page);
  oldField.focus();
  const before = learnerBytes(a.S);
  a.runtime.setReference(extra, false, null);
  a.runtime.refreshStrokeReadings();
  assert.equal(page.children[0], ink);
  assert.notEqual(awake.children[0], oldField);
  assert.equal(a.document.activeElement, awake.children[0]);
  assert(awake.textContent.includes('Saved readings'));
  assert(awake.textContent.includes('ライ'));
  assert.equal(learnerBytes(a.S), before);
});

test('actual writing renderer mounts the tested classification, status and reading helpers', () => {
  const renderer = ast.statements.find(statement => ts.isFunctionDeclaration(statement) &&
    statement.name?.text === 'renderStrokePage');
  assert(renderer, 'Actual writing-room renderer must exist');
  const calls = new Set();
  function collect(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.add(node.expression.text);
    ts.forEachChild(node, collect);
  }
  collect(renderer);
  for (const name of ['strokeRoomRecord', 'strokeClassificationLine', 'strokeReferenceStatus', 'strokeClassicReadings', 'strokeAwakeField'])
    assert(calls.has(name), `Actual mount must still use tested ${name}`);
});

test('negative controls kill legacy-radical, keyword-only search and saved-answer precedence regressions', () => {
  const legacy = app({ control: {
    function: 'classicalRadicalHits',
    from: 'kanjiFacts(c)?.radicalSchemes.classical === radical',
    to: 'D.kanji[c]?.rad === radical',
  } });
  assert.throws(() => assertClassical(legacy), assert.AssertionError);
  const keywords = app({ control: {
    function: 'kdxTextResults',
    from: 'kanjiReferenceView(c, D.kanji[c] || kanjiReference(c)).meanings',
    to: "[D.kanji[c]?.m || '']",
  } });
  assert.throws(() => assertMeaningSearch(keywords), assert.AssertionError);
  const snapshot = savedRecord();
  const lost = app({
    state: { taken: [{ t: 'kanji', id: '頼', kanjiRecord: snapshot }] },
    control: {
      function: 'kanjiEntryRecord',
      from: 'retainedKanjiRecord(id) || kanjiDisplayRecord(id, reference)',
      to: 'kanjiDisplayRecord(id, reference) || retainedKanjiRecord(id)',
    },
  });
  assert.throws(() => assertRetained(lost, snapshot), assert.AssertionError);
});
