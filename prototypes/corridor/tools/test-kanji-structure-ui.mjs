/** Actual renderer/loader probes with the real pure model and six production
 * projections. No browser, layout, rasterization, network, build or learner host.
 * Fake DOM covers only tree membership, SVG attributes, events and focus.
 * queueMicrotask, fetch and timeout callbacks are explicitly controlled.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const json = relative => JSON.parse(read(relative));
const sha = text => createHash('sha256').update(text).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const glyphs = [...'森品晶織識職'];
const groupingText = read('../data/share_alike/kanji-structure.json');
const grouping = JSON.parse(groupingText);
const kanji = json('../data/share_alike/kanji.json').kanji;
const strokes = json('../data/share_alike/strokes.json').strokes;
const runtime = {
  kanji: Object.fromEntries([...glyphs, '木'].map(glyph => [glyph, kanji[glyph]])),
  strokes: Object.fromEntries([...glyphs, '木'].map(glyph => [glyph, strokes[glyph]])),
};
const modelSource = read('../kanji-structure.js');
const corridorSource = read('../corridor.js');
const ast = ts.createSourceFile('corridor.js', corridorSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functionNames = ['loadKanjiStructure', 'renderKanjiStructure', 'activateKanjiStructure', 'mountPageEffects'];
const stateNames = ['kanjiStructureTask', 'kanjiStructureModel', 'kanjiStructureError', 'kanjiStructureMounts'];
const declarations = stateNames.map(name => {
  const statement = ast.statements.find(node => ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === name));
  assert.ok(statement, name);
  return statement.getText(ast);
});
const lifted = [...declarations, ...functionNames.map(name => {
  const node = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(node, name);
  return node.getText(ast);
})].join('\n');
console.log(JSON.stringify({
  scope: 'source-only structure SVG attributes and controlled loader',
  corridorSha256: sha(corridorSource), modelSha256: sha(modelSource),
  productionGroupingSha256: sha(groupingText), liftedFunctionsSha256: sha(lifted),
  functions: functionNames, glyphs,
}));
const tick = () => new Promise(resolve => setImmediate(resolve));

class Element {
  constructor(tag, className = '', text = '') {
    this.tagName = tag.toUpperCase(); this.className = className; this.text = String(text);
    this.children = []; this.attributes = {}; this.dataset = {}; this.events = new Map();
    this.connected = false; this.parentElement = null; this.id = '';
    this.replacements = 0; this.focusCalls = 0;
  }
  append(...children) {
    for (const child of children) {
      if (child instanceof Element) child.parentElement = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) if (child instanceof Element) child.parentElement = null;
    this.children = []; this.replacements++; this.append(...children);
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(type, callback) {
    this.events.set(type, [...(this.events.get(type) || []), callback]);
  }
  querySelectorAll(selector) {
    assert.equal(selector, '[data-kanji-structure]', 'only the actual structure mount selector');
    return descendants(this).slice(1).filter(element => Object.hasOwn(element.dataset, 'kanjiStructure'));
  }
  querySelector(selector) {
    if ([':scope > .scale-thread', ':scope > .sheet-bar', '#sheet-back'].includes(selector)) return null;
    throw new Error(`Unsupported synthetic selector: ${selector}`);
  }
  click() { for (const callback of this.events.get('click') || []) callback({ target: this }); }
  focus() { this.focusCalls++; }
  get isConnected() { return this.connected || !!this.parentElement?.isConnected; }
  get textContent() {
    return this.text + this.children.map(child => child instanceof Element ? child.textContent : String(child)).join('');
  }
}
const descendants = element => [element,
  ...element.children.filter(child => child instanceof Element).flatMap(descendants)];
function harness({ bundle = true, model = true } = {}) {
  const microtasks = [], requests = [], timers = new Map();
  let timerId = 0, sheet = null;
  const window = {};
  if (bundle) window.__CORRIDOR_BUNDLE__ = bundle === true
    ? { 'share_alike/kanji-structure': grouping } : bundle;
  const context = vm.createContext({
    window, D: runtime, SVG_NS: 'http://www.w3.org/2000/svg', AbortController,
    el: (tag, cls, text) => new Element(tag, cls, text),
    biLabel: (tag, cls, _ja, en) => new Element(tag, cls, en),
    tx: (_ja, en) => en,
    document: { createElementNS: (_namespace, tag) => new Element(tag),
      getElementById: () => null, activeElement: null },
    scaleThread: () => null,
    activatePendingLookupReadings: () => {},
    adoptSaveMenuOwner: () => {},
    findSheetDoor: () => null,
    queueMicrotask: callback => microtasks.push(callback),
    setTimeout: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: (url, options) => new Promise((resolve, reject) => {
      requests.push({ url, options, resolve, reject });
      options.signal.addEventListener('abort', () => reject(new Error('synthetic abort')));
    }),
    commitStorePatch: () => { throw new Error('unexpected learner write'); },
  });
  Object.defineProperty(context, 'S', { configurable: true, get() { throw new Error('unexpected learner state access'); } });
  vm.runInContext(modelSource, context);
  if (model) vm.runInContext('window.BunkiKanjiStructure = BunkiKanjiStructure;', context);
  vm.runInContext(lifted, context);
  const state = expression => vm.runInContext(expression, context);
  const flush = () => {
    while (microtasks.length) microtasks.shift()();
  };
  return {
    context, window, requests, timers, microtasks, flush, state,
    async preload() { return context.loadKanjiStructure(); },
    load() { return context.loadKanjiStructure(); },
    render(node, { mount = true } = {}) {
      if (sheet) sheet.connected = false;
      sheet = new Element('section');
      sheet.connected = mount;
      context.renderKanjiStructure(sheet, node);
      return sheet.children[0];
    },
    activate() { context.activateKanjiStructure(sheet); },
    mountEffects(node) {
      // Actual mount hook with only its unrelated navigation/effect dependencies
      // stubbed. These ephemeral sheet fields are not a learner record.
      Object.defineProperty(context, 'S', { configurable: true, value: {
        strokes: null, sheetScrollRestore: null, sheetFocus: null, sheetReturnFocus: null,
      } });
      context.mountPageEffects(sheet, node);
      flush();
    },
    get sheet() { return sheet; },
    get section() { return sheet.children[0]; },
    get text() { return sheet.textContent; },
    get elements() { return descendants(sheet); },
    button(predicate) {
      const button = descendants(sheet).find(element => element.tagName === 'BUTTON' && predicate(element));
      assert.ok(button, `button exists; ${sheet.textContent}`);
      return button;
    },
    select(id) { this.button(element => element.dataset.structureOccurrence === id).click(); },
    selected() {
      return descendants(sheet).filter(element => element.tagName === 'PATH' && element.dataset.selected === 'true')
        .map(element => Number(element.dataset.structureStroke));
    },
    async respond(index, { ok = true, status = 200, data = grouping } = {}) {
      const pending = state('kanjiStructureTask');
      requests[index].resolve({ ok, status, json: async () => data });
      await pending; await tick();
    },
    async expire() {
      const pending = state('kanjiStructureTask');
      assert.equal(timers.size, 1);
      const timer = [...timers.values()][0];
      assert.equal(timer.ms, 8000);
      timer.callback(); await pending; await tick();
    },
  };
}
async function ready(glyph) {
  const h = harness();
  await h.preload();
  const node = { id: glyph };
  h.render(node); h.flush();
  return { h, node, model: h.state('kanjiStructureModel') };
}
function wholeOf(model, glyph) {
  return model.inspect(glyph).occurrences.find(row => row.reference?.type === 'kanji' && row.reference.id === glyph);
}
function reach(h, model, node, occurrence) {
  const whole = wholeOf(model, node.id);
  if (node.kanjiOccurrenceId !== whole.id) h.button(element => Object.hasOwn(element.dataset, 'structureWhole')).click();
  const path = [];
  for (let row = occurrence; row.id !== whole.id; row = model.occurrence(node.id, row.parentId)) {
    assert.ok(row.parentId, 'descendant of the whole glyph');
    path.unshift(row.id);
  }
  for (const id of path) h.select(id);
}

test('real six-glyph projection, UMD export and actual standalone bundle mapping agree', async () => {
  assert.deepEqual(Object.keys(grouping.characters), glyphs);
  const standalone = read('./build-standalone.mjs');
  const parsed = ts.createSourceFile('build-standalone.mjs', standalone, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const bundles = parsed.statements.flatMap(statement => ts.isVariableStatement(statement)
    ? [...statement.declarationList.declarations] : []).find(declaration => declaration.name.getText(parsed) === 'BUNDLES');
  assert.ok(bundles && ts.isObjectLiteralExpression(bundles.initializer));
  const item = bundles.initializer.properties.find(property => property.name.text === 'share_alike/kanji-structure');
  assert.equal(item.initializer.text, 'data/share_alike/kanji-structure.json');
  assert.equal(sha(read(`../${item.initializer.text}`)), sha(groupingText));
  const h = harness();
  assert.equal(typeof h.window.BunkiKanjiStructure.createModel, 'function');
  const model = await h.preload();
  assert.equal(h.requests.length, 0);
  for (const glyph of glyphs) {
    const info = model.inspect(glyph), whole = wholeOf(model, glyph);
    assert.equal(info.grouping.status, 'available');
    assert.equal(info.grouping.strokeParity, 'exact');
    assert.deepEqual(clone(model.project(glyph, whole.id).paths), strokes[glyph]);
    const fixture = `./fixtures/kanji-structure/source/${glyph.codePointAt(0).toString(16).padStart(5, '0')}.svg`;
    assert.equal(sha(read(fixture)), grouping.characters[glyph].source.sha256);
  }
});

test('actual SVG starts at the whole glyph with exact source paths for all six production glyphs', async () => {
  const h = harness(); await h.preload();
  for (const glyph of glyphs) {
    const node = { id: glyph };
    h.render(node, { mount: false });
    assert.equal(h.section.children.length, 1, 'detached prebuild contains its heading only');
    assert.equal(h.section.replacements, 0);
    h.sheet.connected = true; h.activate();
    const paths = h.elements.filter(element => element.tagName === 'PATH');
    assert.deepEqual(paths.map(path => path.getAttribute('d')), strokes[glyph]);
    assert.deepEqual(h.selected(), strokes[glyph].map((_, index) => index));
    assert.ok(paths.every(path => path.getAttribute('opacity') === '1'));
    assert.match(h.text, /do not establish meaning, sound or historical origin/);
    assert.equal(h.elements.find(element => element.tagName === 'A').href, grouping.characters[glyph].source.url);
  }
});

test('森 three 木 are independently selectable through the real nested 林 controls', async () => {
  const { h, node, model } = await ready('森');
  const woods = model.inspect('森').occurrences.filter(row => row.reference?.id === '木');
  assert.equal(woods.length, 3);
  assert.equal(new Set(woods.map(row => row.id)).size, 3);
  for (const [index, wood] of woods.entries()) {
    reach(h, model, node, wood);
    const expected = Array.from({ length: 4 }, (_, offset) => index * 4 + offset);
    assert.deepEqual(h.selected(), expected);
    assert.equal(node.kanjiOccurrenceId, wood.id);
    assert.equal(h.elements.filter(element => element.tagName === 'PATH' && element.getAttribute('opacity') === '0.18').length, 8);
    assert.match(h.text, /no smaller group here/);
    const caption = h.elements.find(element => element.id === 'kanji-structure-selection-森');
    assert.equal(caption.focusCalls, 1);
  }
});

test('品 and 晶 preserve unnamed intermediate groups and three independent repeated occurrences', async () => {
  for (const [glyph, part, width] of [['品', '口', 3], ['晶', '日', 4]]) {
    const { h, node, model } = await ready(glyph);
    const parts = model.inspect(glyph).occurrences.filter(row => row.reference?.id === part);
    assert.equal(parts.length, 3);
    for (const [index, occurrence] of parts.entries()) {
      reach(h, model, node, occurrence);
      assert.deepEqual(h.selected(), Array.from({ length: width }, (_, offset) => index * width + offset));
      assert.equal(node.kanjiOccurrenceId, occurrence.id);
    }
    const unnamed = model.inspect(glyph).occurrences.find(row => !row.reference && row.parentId !== null);
    reach(h, model, node, unnamed);
    assert.match(h.text, /Unnamed source group/);
    assert.equal(h.elements.filter(element => element.dataset.structureOccurrence).length, 2);
    assert.deepEqual(h.selected(), Array.from({ length: width * 2 }, (_, offset) => width + offset));
  }
});

test('one-level-out and whole controls restore exact selections; rerender retains selection on navigation node', async () => {
  const { h, node, model } = await ready('森');
  const grove = model.inspect('森').occurrences.find(row => row.reference?.id === '林');
  const child = model.occurrence('森', grove.childIds[0]);
  reach(h, model, node, child);
  const selected = node.kanjiOccurrenceId;
  const oldSection = h.section;
  h.render(node); h.flush();
  assert.equal(node.kanjiOccurrenceId, selected);
  assert.deepEqual(h.selected(), [4, 5, 6, 7]);
  assert.equal(oldSection.isConnected, false);
  h.button(element => Object.hasOwn(element.dataset, 'structureBack')).click();
  assert.equal(node.kanjiOccurrenceId, grove.id);
  assert.deepEqual(h.selected(), [4, 5, 6, 7, 8, 9, 10, 11]);
  h.button(element => Object.hasOwn(element.dataset, 'structureBack')).click();
  assert.equal(node.kanjiOccurrenceId, wholeOf(model, '森').id);
  reach(h, model, node, child);
  h.button(element => Object.hasOwn(element.dataset, 'structureWhole')).click();
  assert.deepEqual(h.selected(), Array.from({ length: 12 }, (_, index) => index));
});

test('absent grouping and stale/cross-glyph occurrence IDs never invent a component geometry', async () => {
  const { h, model } = await ready('森');
  const foreign = model.inspect('品').occurrences.find(row => row.reference?.id === '口').id;
  for (const selected of ['invented-id', foreign]) {
    const node = { id: '森', kanjiOccurrenceId: selected };
    h.render(node); h.flush();
    assert.equal(node.kanjiOccurrenceId, wholeOf(model, '森').id);
    assert.equal(h.selected().length, 12);
  }
  for (const glyph of ['木', '𠮟']) {
    const node = { id: glyph }, before = clone(node);
    h.render(node); h.flush();
    assert.match(h.text, /Source grouping is not bundled/);
    assert.equal(h.elements.filter(element => ['PATH', 'SVG', 'BUTTON'].includes(element.tagName)).length, 0);
    assert.deepEqual(node, before);
  }
});

test('only navigation selection changes; no learner object or writer is available to the actual renderer', async () => {
  const before = JSON.stringify(runtime);
  const { h, node, model } = await ready('織');
  const family = model.inspect('織').occurrences.find(row => row.reference?.id === '戠');
  reach(h, model, node, family);
  assert.equal(h.selected().length, 12);
  assert.deepEqual(Object.keys(node).sort(), ['id', 'kanjiOccurrenceId']);
  assert.equal(JSON.stringify(runtime), before);
  assert.equal(h.requests.length, 0);
});

test('fetch loader is single-flight, uses exact path/signal and clears its timeout on success', async () => {
  const h = harness({ bundle: false });
  const first = h.load(), second = h.load();
  assert.strictEqual(first, second);
  await tick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, 'data/share_alike/kanji-structure.json');
  assert.equal(h.requests[0].options.signal.aborted, false);
  assert.equal(h.timers.size, 1);
  await h.respond(0);
  assert.ok(await first);
  assert.equal(h.state('kanjiStructureTask'), null);
  assert.equal(h.state('kanjiStructureError'), null);
  assert.equal(h.timers.size, 0);
  assert.strictEqual(await h.load(), await first);
  assert.equal(h.requests.length, 1);
});

test('actual failed-load Retry button clears failure and shares one new attempt', async () => {
  const h = harness({ bundle: false }), node = { id: '森' };
  h.render(node); h.flush(); await tick();
  assert.match(h.text, /Loading source stroke groups/);
  await h.respond(0, { ok: false, status: 503 });
  assert.equal(h.state('kanjiStructureModel'), null);
  assert.match(h.text, /source groups could not load/);
  const retry = h.button(element => element.textContent === 'Try again');
  retry.click(); retry.click(); await tick();
  assert.equal(h.requests.length, 2);
  assert.match(h.text, /Loading source stroke groups/);
  await h.respond(1);
  assert.equal(h.selected().length, 12);
  assert.equal(h.state('kanjiStructureError'), null);
  assert.equal(h.timers.size, 0);
});

test('wrong standalone key and missing controller fail honestly without network fallback', async () => {
  for (const options of [{ bundle: { 'share_alike/wrong-key': grouping } }, { model: false }]) {
    const h = harness(options);
    h.render({ id: '森' }); h.flush();
    const pending = h.state('kanjiStructureTask');
    await pending; await tick();
    assert.equal(h.requests.length, 0);
    assert.equal(h.state('kanjiStructureModel'), null);
    assert.match(h.text, /source groups could not load/);
    assert.equal(h.selected().length, 0);
    assert.equal(h.timers.size, 0);
  }
});

test('timeout abort clears single-flight state and allows an explicit fresh retry', async () => {
  const h = harness({ bundle: false });
  const first = h.load(); await tick();
  await h.expire();
  assert.equal(await first, null);
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.equal(h.state('kanjiStructureTask'), null);
  assert.equal(h.timers.size, 0);
  const retry = h.load(); await tick();
  assert.notStrictEqual(retry, first);
  assert.equal(h.requests.length, 2);
  await h.respond(1);
  assert.ok(await retry);
});

test('actual mountPageEffects activates an idle-prebuilt sheet; late response waits for same-sheet remount', async () => {
  const h = harness({ bundle: false }), node = { id: '森' };
  const section = h.render(node, { mount: false });
  h.flush(); await tick();
  assert.equal(section.replacements, 0);
  assert.equal(section.children.length, 1);
  assert.equal(h.requests.length, 0, 'idle-prebuilt sheet does not fetch before real mount');
  assert.equal(h.timers.size, 0);
  h.sheet.connected = true; h.mountEffects(node); await tick();
  assert.equal(h.requests.length, 1);
  assert.match(h.text, /Loading source stroke groups/);
  const beforeDetached = { replacements: section.replacements, text: section.textContent };
  h.sheet.connected = false;
  await h.respond(0);
  assert.equal(section.replacements, beforeDetached.replacements);
  assert.equal(section.textContent, beforeDetached.text);
  assert.deepEqual(node, { id: '森' });
  h.sheet.connected = true; h.mountEffects(node);
  assert.equal(h.selected().length, 12);
  assert.strictEqual(h.section, section, 'original weak-map callback remains on the prebuilt section');
  assert.equal(h.requests.length, 1, 'cached data reused on remount');
  const firstChild = h.elements.find(element => element.dataset.structureOccurrence);
  firstChild.click();
  const chosen = node.kanjiOccurrenceId, selected = h.selected();
  h.sheet.connected = false; h.flush();
  h.sheet.connected = true; h.mountEffects(node);
  assert.equal(node.kanjiOccurrenceId, chosen);
  assert.deepEqual(h.selected(), selected);
  assert.equal(h.requests.length, 1);
});

test('late completion of mounted-then-detached view leaves old section and selection untouched', async () => {
  const h = harness({ bundle: false }), node = { id: '森' };
  const old = h.render(node);
  h.flush(); await tick();
  const before = { replacements: old.replacements, text: old.textContent };
  h.sheet.connected = false;
  await h.respond(0);
  assert.equal(old.replacements, before.replacements);
  assert.equal(old.textContent, before.text);
  assert.deepEqual(node, { id: '森' });
});
