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
  'kanjiReference', 'currentJoyoKunNote', 'joyoOnNote', 'kanjiFinderUniverse', 'kanjiDisplayRecord', 'kanjiEntryRecord', 'strokeRoomRecord',
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
      kanjiFactsState, kanjiReadingsState, currentJoyoKunNote, joyoOnNote, kanjiFacts, kanjiReferenceView, classicalRadicalHits,
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

// E3: exercise the real entry/writing adapter, not a second implementation.
const joyoFixture = JSON.parse(read('../../../tools/fixtures/reference/joyo-2010.json'));
const fullKunKey = value => String(value).replace(/\./gu, '');
const fixtureKun = readings => readings.filter(value => !/[ァ-ヺ]/u.test(value));
test('E3 official kun display is complete, raw-attested and pure for every Jōyō form', () => {
  const a = app();
  const before = JSON.stringify({ D: a.D, S: a.S });
  for (const [glyph, readings] of joyoFixture.rows) {
    const record = a.runtime.kanjiDisplayRecord(glyph);
    assert(record, glyph);
    const raw = canonical[glyph]?.kun || [];
    const expected = fixtureKun(readings);
    assert.deepEqual(plain(record.joyoKun.map(fullKunKey)), expected, glyph);
    const officialOn = readings.filter(value => /[ァ-ヺ]/u.test(value));
    assert.deepEqual(plain(record.joyoOn), officialOn, glyph);
    assert.deepEqual(plain(record.outsideJoyoOn), plain(record.on.filter(value => !officialOn.includes(value))), glyph);
    for (const value of officialOn) assert(record.on.includes(value), `${glyph}: official on ${value}`);
    const visible = record.kun.map(fullKunKey);
    for (const reading of expected) assert(visible.includes(fullKunKey(reading)), `${glyph}: ${reading}`);
    const dictionary = extra.kanjiReadings.find(row => row[0] === glyph)?.[2] || [];
    for (const reading of record.kun.filter(value => value.includes('.')))
      assert([...raw, ...dictionary, ...dictionary.map(value => value.replace(/-/g, ''))].includes(reading), `${glyph}: unattested dots in ${reading}`);
    if (record.unattestedKun.length) assert(record.kun.every(value => !value.includes('.')), glyph);
    for (const reading of [...raw, ...dictionary])
      assert(visible.includes(fullKunKey(reading)), `${glyph}: lost ${reading}`);
    assert.deepEqual(plain(a.runtime.strokeRoomRecord(glyph).kun), plain(record.kun));
  }
  assert.equal(JSON.stringify({ D: a.D, S: a.S }), before);
});
test('E3 開 生 閉 have the requested attested additions and unchanged lesson fields', () => {
  const a = app();
  for (const [glyph, additions] of [['開', ['あく', 'あける']], ['生', ['うまれる', 'うむ', 'なま']], ['閉', ['しまる']]]) {
    const record = a.runtime.kanjiEntryRecord(glyph);
    for (const reading of additions) assert(record.kun.some(value => fullKunKey(value) === reading), `${glyph}: ${reading}`);
    assert.deepEqual(plain(record.lessonKun), canonical[glyph].kun);
    assert.deepEqual(plain(record.kun.slice(0, canonical[glyph].kun.length)), canonical[glyph].kun);
  }
});
test('E3 complete projection is consumed: an omitted official row fails the display contract', () => {
  const broken = copyFacts();
  assert(Array.isArray(broken.joyoKun), 'projection must exist');
  broken.joyoKun = broken.joyoKun.filter(([glyph]) => glyph !== '開');
  const record = app({ supplement: broken }).runtime.kanjiEntryRecord('開');
  const healthy = app().runtime.kanjiEntryRecord('開');
  assert.equal(healthy.joyoKun.length, 4);
  assert.notDeepEqual(plain(record.joyoKun || []), plain(healthy.joyoKun));
});

test('E3 display retains attested dictionary dots, affixes and fallback', () => {
  const raw = Object.freeze(['い.きる']);
  const official = Object.freeze(['いきる', 'うまれる', 'なま']);
  const dictionary = Object.freeze(['い.きる', 'う.まれる', 'うま.れる', 'なま', 'なま-', '-う']);
  const projected = core.joyoKunDisplay(raw, official, dictionary, '生');
  assert.deepEqual(plain(projected), { joyoKun: ['い.きる', 'う.まれる', 'なま'],
    kun: ['い.きる', 'う.まれる', 'なま', 'なま-', '-う'], kunDotMode: 'attested', unattestedKun: [] });
  assert.deepEqual(plain(core.joyoKunDisplay(raw, undefined, dictionary).kun), [...new Set([...raw, ...dictionary])]);
  assert.deepEqual(plain(core.joyoKunDisplay([], [], ['う.む']).kun), ['う.む']);
});

// Independent reading pairs from 通則4 例外, matched to the pinned 2010 table.
const exceptionNouns = { 謡: 'うたい', 虞: 'おそれ', 趣: 'おもむき', 氷: 'こおり', 印: 'しるし',
  頂: 'いただき', 帯: 'おび', 畳: 'たたみ', 卸: 'おろし', 煙: 'けむり', 恋: 'こい', 志: 'こころざし',
  次: 'つぎ', 隣: 'となり', 富: 'とみ', 恥: 'はじ', 話: 'はなし', 光: 'ひかり', 舞: 'まい',
  折: 'おり', 係: 'かかり', 掛: 'かかり', 組: 'くみ', 肥: 'こえ', 並: 'なみ', 巻: 'まき', 割: 'わり' };
const nounDeltaCases = [['卸', 'おろし', 'おろ.し'], ['割', 'わり', 'わ.り'], ['巻', 'まき', 'ま.き'],
  ['折', 'おり', 'お.り'], ['彼', 'かの', 'か.の'], ['掛', 'かかり', 'か.かり'],
  ['並', 'なみ', 'な.み'], ['謡', 'うたい', 'うた.い']];
function nounProjection(api, glyph) {
  const official = fixtureKun(joyoFixture.rows.find(row => row[0] === glyph)[1]);
  const dictionary = extra.kanjiReadings.find(row => row[0] === glyph)[2];
  return { official, dictionary, view: api.joyoKunDisplay(canonical[glyph]?.kun || [], official, dictionary, glyph) };
}
function assertNoun(api, glyph, reading) {
  const { official, view } = nounProjection(api, glyph);
  assert.equal(view.joyoKun[official.indexOf(reading)], reading, `${glyph}: noun ${reading} must be undotted`);
}
function assertVerbDots(api, glyph) {
  const { official, dictionary, view } = nounProjection(api, glyph);
  let checked = 0;
  for (const reading of official.filter(value => value !== exceptionNouns[glyph])) {
    const forms = [...new Set(dictionary.filter(value => value.replace(/[.-]/g, '') === reading)
      .map(value => value.replace(/-/g, '')).filter(value => value.includes('.')))];
    if (forms.length === 1) {
      assert.equal(view.joyoKun[official.indexOf(reading)], forms[0], `${glyph}: verb ${forms[0]} must keep its dot`);
      checked++;
    }
  }
  return checked;
}
test('E3.2 all 27 official noun exceptions and 彼 are undotted while verbs retain attested dots', () => {
  assert.equal(Object.keys(exceptionNouns).length, 27);
  assert.deepEqual(plain(core.JOYO_KUN_ORTHOGRAPHY.nouns), exceptionNouns);
  assert.equal(core.JOYO_KUN_ORTHOGRAPHY.source,
    'https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/okurikana/honbun04.html');
  let verbCount = 0;
  for (const [glyph, reading] of Object.entries(exceptionNouns)) {
    assertNoun(core, glyph, reading);
    verbCount += assertVerbDots(core, glyph);
  }
  assert(verbCount > 20, 'noun handling must exercise verbs, not strip all dots from the glyph');
  assertNoun(core, '彼', 'かの');
  const a = app(), before = JSON.stringify({ D: a.D, S: a.S });
  for (const [glyph, undotted, dotted] of nounDeltaCases) {
    for (const resolve of [a.runtime.kanjiDisplayRecord, a.runtime.kanjiEntryRecord, a.runtime.strokeRoomRecord]) {
      const record = resolve(glyph);
      assert(record.joyoKun.includes(undotted) && !record.joyoKun.includes(dotted), glyph);
      assert(record.kun.includes(undotted) && !record.kun.includes(dotted), glyph);
      assert(record.completeKun.includes(dotted), `${glyph}: full dictionary inventory retains ${dotted}`);
      assert.deepEqual(plain(record.lessonKun), canonical[glyph].kun);
    }
    const snapshot = { ...savedRecord(glyph), kun: [...canonical[glyph].kun] };
    const saved = app({ state: { taken: [{ t: 'kanji', id: glyph, kanjiRecord: snapshot }] } });
    assert.deepEqual(plain(saved.runtime.kanjiEntryRecord(glyph).kun), snapshot.kun);
  }
  assert.equal(JSON.stringify({ D: a.D, S: a.S }), before);
});

test('E3.2 controls reject a dot on each noun exception and loss of each exception glyph verb dot', () => {
  const branch = /if \(JOYO_KUN_ORTHOGRAPHY.nouns\[glyph\] === reading \|\|\s*JOYO_KUN_ORTHOGRAPHY.lexical\[.*?\] === reading\) form = reading;/;
  assert.equal([...coreSource.matchAll(new RegExp(branch, 'g'))].length, 1);
  const corruptNouns = { module: { exports: {} } };
  vm.runInNewContext(coreSource.replace(branch, match => match.replace('form = reading;',
    "form = reading.slice(0, -1) + '.' + reading.slice(-1);")), corruptNouns);
  for (const [glyph, reading] of [...Object.entries(exceptionNouns), ['彼', 'かの']])
    assert.throws(() => assertNoun(corruptNouns.module.exports, glyph, reading), assert.AssertionError, glyph);
  const show = 'const show = value => undotted ? full(value) : selected.get(full(value)) || value;';
  assert.equal(coreSource.split(show).length, 2);
  const corruptVerbs = { module: { exports: {} } };
  vm.runInNewContext(coreSource.replace(show, 'const show = value => full(value);'), corruptVerbs);
  for (const glyph of Object.keys(exceptionNouns)) if (assertVerbDots(core, glyph))
    assert.throws(() => assertVerbDots(corruptVerbs.module.exports, glyph), assert.AssertionError, glyph);
});

test('E3.2 bounded precedence changes eight rows; removing attested raw resolution widens it to 19 rows and 41 readings', () => {
  const exceptionBranch = /if \(JOYO_KUN_ORTHOGRAPHY.nouns\[glyph\] === reading \|\|\s*JOYO_KUN_ORTHOGRAPHY.lexical\[.*?\] === reading\) form = reading;\s*else if/;
  assert.equal([...coreSource.matchAll(new RegExp(exceptionBranch, 'g'))].length, 1);
  const prior = { module: { exports: {} } };
  vm.runInNewContext(coreSource.replace(exceptionBranch, 'if'), prior);
  const retained = /else if \(retained !== undefined\) form = retained;[^\n]*/;
  assert.equal([...coreSource.matchAll(new RegExp(retained, 'g'))].length, 1);
  const overbroad = { module: { exports: {} } };
  vm.runInNewContext(coreSource.replace(retained, ''), overbroad);
  const changed = [], rejected = [];
  let changedReadings = 0;
  for (const [glyph, readings] of joyoFixture.rows) {
    const raw = canonical[glyph]?.kun || [], official = fixtureKun(readings);
    const dictionary = extra.kanjiReadings.find(row => row[0] === glyph)?.[2] || [];
    const args = [raw, official, dictionary, glyph];
    const before = plain(prior.module.exports.joyoKunDisplay(...args));
    const actual = plain(core.joyoKunDisplay(...args));
    const bad = plain(overbroad.module.exports.joyoKunDisplay(...args));
    const expected = nounDeltaCases.find(row => row[0] === glyph);
    if (!expected) assert.deepEqual(actual, before, `${glyph}: outside bounded delta`);
    else {
      const [, undotted, dotted] = expected;
      assert.deepEqual(actual, { ...before,
        kun: before.kun.map(value => value === dotted ? undotted : value),
        joyoKun: before.joyoKun.map(value => value === dotted ? undotted : value),
      }, `${glyph}: only the official noun dot changes`);
      changed.push(glyph);
    }
    if (JSON.stringify(bad.joyoKun) !== JSON.stringify(before.joyoKun)) rejected.push(glyph);
    changedReadings += before.joyoKun.filter((value, i) => value !== bad.joyoKun[i]).length;
  }
  assert.deepEqual(changed.sort(), nounDeltaCases.map(row => row[0]).sort());
  assert.equal(rejected.length, 19);
  assert.equal(changedReadings, 41);
  assert.throws(() => assert.equal(rejected.length, 8), assert.AssertionError);
});

test('E3 saved 開 生 閉 retain their answers and expose current official kun separately', () => {
  for (const glyph of ['開', '生', '閉']) {
    const snapshot = { ...savedRecord(glyph), on: [...canonical[glyph].on], kun: [...canonical[glyph].kun] };
    const a = app({ state: { taken: [{ t: 'kanji', id: glyph, kanjiRecord: snapshot }] } });
    const before = JSON.stringify(a.S);
    const record = a.runtime.kanjiEntryRecord(glyph);
    assert.deepEqual(plain(record.kun), snapshot.kun);
    const official = a.runtime.kanjiDisplayRecord(glyph).joyoKun;
    for (const node of [a.runtime.currentJoyoKunNote(glyph), a.runtime.strokeReadingField(record), a.runtime.strokeClassicReadings(record)]) {
      assert(node.textContent.includes('Jōyō kun readings (2010 table)'));
      for (const reading of official) assert(node.textContent.includes(reading), `${glyph}:${reading}`);
    }
    assert.equal(JSON.stringify(a.S), before);
  }
});
test('E3 malformed or missing table fails visibly; a full replacement restores completion', async () => {
  for (const mutate of [value => delete value.joyoKun, value => value.joyoKun.pop(),
    value => value.joyoKun[1][1].push('あ.われ'), value => value.joyoKun[1][1].pop(),
    value => value.joyoKun[1][0] = value.joyoKun[0][0]]) {
    const broken = copyFacts(); mutate(broken);
    assert.equal(core.validateJoyoKun(broken), false);
    const a = app({ supplement: broken });
    assert.equal(a.runtime.kanjiReadingsState(), 'failed');
    assert.equal(a.runtime.kanjiEntryRecord('開').readingsState, 'failed');
    a.runtime.setReference(extra, false, null);
    assert.equal(a.runtime.kanjiReadingsState(), 'complete');
    assert(a.runtime.kanjiEntryRecord('開').kun.includes('あ.く'));
  }
  const a = app();
  a.context.window.BunkiReferenceCore = { mergeReadings: core.mergeReadings };
  assert.equal(a.runtime.kanjiEntryRecord('開').readingsState, 'failed');
  assert.deepEqual(plain(a.runtime.kanjiEntryRecord('開').kun), canonical.開.kun);
});

test('E3 actual loader refuses incomplete kun data and retries without changing learner state', async () => {
  const a = app({ supplement: null });
  const before = learnerBytes(a.S);
  const broken = copyFacts(); broken.joyoKun.pop();
  a.context.window.__CORRIDOR_BUNDLE__ = { 'share_alike/reference-extra': broken };
  assert.equal(await a.runtime.loadReferenceExtra(), null);
  assert.equal(a.D.referenceExtra, null);
  assert.equal(a.runtime.kanjiReadingsState(), 'failed');
  a.context.window.__CORRIDOR_BUNDLE__ = { 'share_alike/reference-extra': extra };
  assert.equal(await a.runtime.loadReferenceExtra(), extra);
  assert.equal(a.runtime.kanjiReadingsState(), 'complete');
  assert(a.runtime.kanjiEntryRecord('生').kun.includes('う.まれる'));
  assert.equal(learnerBytes(a.S), before);
  assert.equal(a.timers.size, 0);
});
test('E3 catalog display completes the fixture without altering raw or full dictionary inventories', () => {
  const beforeExtra = copyFacts(); delete beforeExtra.joyoKun;
  const input = { kanji: canonical, extra };
  const before = core.createCatalog({ ...input, extra: beforeExtra });
  const after = core.createCatalog(input);
  const entries = catalog => new Map(catalog.collections.flatMap(collection => collection.entries)
    .filter(entry => entry.type === 'kanji').map(entry => [entry.id, entry]));
  const old = entries(before), current = entries(after);
  for (const [glyph, readings] of joyoFixture.rows) {
    const entry = current.get(glyph);
    assert(entry, glyph);
    assert.deepEqual(plain(entry.kun), plain(old.get(glyph).kun), `${glyph}: raw kun`);
    assert.deepEqual(plain(entry.completeKun), plain(old.get(glyph).completeKun), `${glyph}: completeKun`);
    assert.deepEqual(plain(entry.readings), plain(old.get(glyph).readings), `${glyph}: lookup inventory`);
    for (const kun of fixtureKun(readings)) {
      assert(entry.displayKun.some(value => fullKunKey(value) === kun), `${glyph}: kun cell ${kun}`);
      assert(entry.displayReadings.some(value => fullKunKey(value) === kun), `${glyph}: combined cell ${kun}`);
    }
  }
});

const outsideOnCases = { 職: ['ソク'], 清: ['シン'], 請: ['ショウ'], 侍: ['シ'], 工: ['グ'],
  霧: ['ボウ', 'ブ'], 金: ['ゴン'], 手: ['ズ'], 米: ['メエトル'], 貝: ['バイ'], 阜: ['フウ'], 狙: ['ショ'] };
test('E3 scope-add labels the twelve outside-table on cases and completes 中 without rewriting raw', () => {
  const a = app();
  const before = JSON.stringify({ D: a.D, S: a.S });
  assert(!canonical.中.on.includes('ジュウ'));
  const middle = a.runtime.kanjiDisplayRecord('中');
  assert(middle.on.includes('ジュウ'));
  assert(middle.joyoOn.includes('ジュウ'));
  assert(!middle.outsideJoyoOn.includes('ジュウ'));
  for (const [glyph, wanted] of Object.entries(outsideOnCases)) {
    const record = a.runtime.kanjiDisplayRecord(glyph);
    for (const reading of wanted) {
      assert(record.on.includes(reading), `${glyph}: reading preserved ${reading}`);
      assert(record.outsideJoyoOn.includes(reading), `${glyph}: outside label ${reading}`);
    }
  }
  assert.equal(JSON.stringify({ D: a.D, S: a.S }), before);
});

test('E3 labels outside-table on readings visibly on saved and current writing surfaces', () => {
  for (const [glyph, wanted] of Object.entries(outsideOnCases)) {
    for (const saved of [false, true]) {
      const snapshot = { ...savedRecord(glyph), on: [...canonical[glyph].on], kun: [...canonical[glyph].kun] };
      const a = app({ state: saved ? { taken: [{ t: 'kanji', id: glyph, kanjiRecord: snapshot }] } : {} });
      const before = JSON.stringify(a.S);
      const record = a.runtime.kanjiEntryRecord(glyph);
      for (const node of [a.runtime.joyoOnNote(glyph, record.on), a.runtime.strokeReadingField(record), a.runtime.strokeClassicReadings(record)]) {
        assert(node.textContent.includes('On readings outside the jōyō table'), glyph);
        for (const value of wanted) assert(node.textContent.includes(value), `${glyph}: ${value}`);
        if (saved) assert(node.textContent.includes('Jōyō on readings (2010 table)'));
      }
      assert.equal(JSON.stringify(a.S), before);
    }
  }
  const snapshot = { ...savedRecord('中'), on: [...canonical.中.on], kun: [...canonical.中.kun] };
  const a = app({ state: { taken: [{ t: 'kanji', id: '中', kanjiRecord: snapshot }] } });
  assert.deepEqual(plain(a.runtime.kanjiEntryRecord('中').on), snapshot.on);
  assert(a.runtime.joyoOnNote('中', snapshot.on).textContent.includes('ジュウ'));
  assert.equal(app().runtime.joyoOnNote('中', ['チュウ', 'ジュウ']), null);
  assert.equal(app({ supplement: null }).runtime.joyoOnNote('職', ['ソク']), null);
});
test('E3 actual loader rejects missing/partial/misaligned official on tables, then retries', async () => {
  for (const mutate of [value => delete value.joyoOn, value => value.joyoOn.pop(),
    value => value.joyoOn[0][1].push('あ'), value => value.joyoOn.reverse()]) {
    const broken = copyFacts(); mutate(broken);
    assert.equal(core.validateJoyoOn(broken), false);
    const a = app({ supplement: null });
    a.context.window.__CORRIDOR_BUNDLE__ = { 'share_alike/reference-extra': broken };
    assert.equal(await a.runtime.loadReferenceExtra(), null);
    assert.equal(a.runtime.kanjiReadingsState(), 'failed');
    a.context.window.__CORRIDOR_BUNDLE__ = { 'share_alike/reference-extra': extra };
    assert.equal(await a.runtime.loadReferenceExtra(), extra);
    assert(a.runtime.kanjiDisplayRecord('中').on.includes('ジュウ'));
  }
});
test('E3 control catches a hidden outside-table label rather than merely testing metadata', () => {
  const broken = app({ control: { function: 'joyoOnNote',
    from: 'if (outside.length) parts.push', to: 'if (false) parts.push' } });
  assert.equal(broken.runtime.joyoOnNote('職', ['ショク', 'ソク']), null);
  const healthy = app().runtime.joyoOnNote('職', ['ショク', 'ソク']);
  assert(healthy.textContent.includes('On readings outside the jōyō table'));
  assert(healthy.textContent.includes('ソク'));
});

test('E3 0545 uses the four attested 本則 choices and whole-list undotted fallback', () => {
  for (const [glyph, reading, chosen] of [['押', 'おさえる', 'お.さえる'], ['交', 'かわす', 'か.わす'],
    ['行', 'おこなう', 'おこな.う'], ['生', 'うまれる', 'う.まれる']]) {
    const dictionary = extra.kanjiReadings.find(row => row[0] === glyph)[2];
    assert(dictionary.includes(chosen));
    assert.deepEqual(plain(core.joyoKunDisplay([], [reading], dictionary, glyph).joyoKun), [chosen]);
  }
  const a = app();
  for (const glyph of ['塞', '羨', '速', '丼', '務', '踊', '絡']) {
    const record = a.runtime.kanjiEntryRecord(glyph);
    assert.equal(record.kunDotMode, 'undotted-unattested', glyph);
    assert(record.unattestedKun.length > 0, glyph);
    assert(record.kun.every(value => !value.includes('.')), glyph);
  }
  const refused = core.joyoKunDisplay([], ['うまれる'], ['うま.れる'], '生');
  assert.deepEqual(plain(refused.joyoKun), ['うま.れる'], 'never invent the preferred form when its source omits it');
  const unresolved = core.joyoKunDisplay(['た.べる'], ['たべる', 'みる'], ['た.べる'], '食');
  assert.deepEqual(plain(unresolved.kun), ['たべる', 'みる']);
  assert.deepEqual(plain(unresolved.unattestedKun), ['みる']);
});
