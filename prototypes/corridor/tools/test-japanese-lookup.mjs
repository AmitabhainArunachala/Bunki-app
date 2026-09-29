/** Actual lookup/mini/prose functions over the bundled dictionary, lifted by the repository's
 * existing TypeScript-AST seam. The small DOM below supplies events/tree walking only; no browser,
 * record persistence, network, audio, or grading is simulated. A resolved save is observed at the
 * list-chooser boundary, including its exact word/sequence/reading. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../corridor.js', import.meta.url), 'utf8');
const ast = ts.createSourceFile('corridor.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = ['lookup', 'dictionaryCoreMatch', 'dictionaryReadingSummaries', 'dictionaryGlossSummary',
  'dictionaryReadingSupportsForm', 'dictionarySummaryFor', 'dictionaryRowsForForm', 'dictionaryRowBySeq',
  'kataToHira', 'KATA_TO_HIRA_OFFSET', 'normalizeGloss', 'GLOSS_MESSY', 'GLOSS_LEAD',
  'LOOKUP_HELPER_POS', 'japaneseLookupRecord', 'openJapaneseLookup', 'appendJapaneseLookup',
  'enhanceJapaneseProse', 'showMini', 'lookupBlockWords', 'setLookupStop', 'japaneseLookupHelpId', 'lookupOccurrence',
  'lookupItemBlocks', 'findLookupOccurrence', 'japaneseLookupMini', 'lookupWordKey'];
const declarations = new Map();
for (const statement of ast.statements) {
  const declared = ts.isFunctionDeclaration(statement) ? [statement.name?.text]
    : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map(node => node.name.getText(ast)) : [];
  for (const name of declared) if (names.includes(name)) declarations.set(name, statement.getText(ast));
}
assert.equal(declarations.size, names.length, 'Every exercised function is the actual authored declaration');
const program = [...new Set(declarations.values())].join('\n');
const dict = JSON.parse(readFileSync(new URL('../data/share_alike/dict.json', import.meta.url), 'utf8')).words;
const words = JSON.parse(readFileSync(new URL('../data/share_alike/words.json', import.meta.url), 'utf8')).words;
const index = JSON.parse(readFileSync(new URL('../data/share_alike/dict-v2/index.json', import.meta.url), 'utf8'));
const copy = value => JSON.parse(JSON.stringify(value));

class Element {
  constructor(tag = 'div', classes = '', text = '') {
    Object.assign(this, { tag, className: classes || '', ownText: text || '', children: [], dataset: {}, style: {},
      attributes: {}, listeners: {}, disabled: false, parentElement: null, isConnected: true });
    const classesNow = () => this.className.split(' ').filter(Boolean);
    this.classList = { contains: name => classesNow().includes(name),
      add: name => { if (!classesNow().includes(name)) this.className = [...classesNow(), name].join(' '); },
      remove: name => { this.className = classesNow().filter(value => value !== name).join(' '); },
      toggle: (name, force) => { const on = force ?? !classesNow().includes(name);
        if (on) this.classList.add(name); else this.classList.remove(name); return on; } };
  }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  set textContent(text) { this.ownText = text; this.children = []; }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parentElement = this; } }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(kind, handler) { (this.listeners[kind] ||= []).push(handler); }
  async click() { if (!this.disabled) for (const handler of this.listeners.click || []) await handler({ stopPropagation() {}, detail: 0 }); }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector === '[data-japanese-lookup]') return this.dataset.japaneseLookup !== undefined;
    if (selector === '[data-lookup-item]') return this.dataset.lookupItem !== undefined;
    if (selector === '[data-lookup-block]') return this.dataset.lookupBlock !== undefined;
    return this.tag === selector;
  }
  closest(selectors) {
    if (selectors.split(',').some(selector => this.matches(selector.trim()))) return this;
    return this.parentElement?.closest(selectors) ?? null;
  }
  querySelectorAll(selectors) {
    const found = [];
    const walk = node => { for (const child of node.children) { if (selectors.split(',').some(selector => child.matches(selector.trim()))) found.push(child); walk(child); } };
    walk(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  replaceWith(fragment) {
    const siblings = this.parentElement.children, at = siblings.indexOf(this);
    const next = fragment.tag === '#fragment' ? fragment.children : [fragment];
    siblings.splice(at, 1, ...next); for (const node of next) node.parentElement = this.parentElement;
    this.isConnected = false;
  }
  getBoundingClientRect() { return { top: 200, bottom: 220, left: 20, width: 40, height: 20 }; }
  focus() {}
  remove() { this.isConnected = false; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); }
}
const find = (node, className) => node.querySelector('.' + className);
const text = value => new Element('#text', '', value);

function app({ withIndex = true } = {}) {
  const body = new Element('body'), opened = [], chosen = [];
  const D = { dict, words, kanji: {}, dictionaryIndex: withIndex ? index : null,
    dictionaryByForm: new Map(), dictionaryCompleteForms: new Set(), dictionaryBySeq: new Map() };
  const document = { body, querySelectorAll: selector => body.querySelectorAll(selector),
    getElementById: id => body.querySelector(`#${id}`),
    createTextNode: text, createDocumentFragment: () => new Element('#fragment'),
    createTreeWalker(parent) {
      const nodes = [];
      const visit = node => { for (const child of node.children) { if (child.tag === '#text') nodes.push(child); visit(child); } };
      visit(parent); let at = -1;
      return { nextNode() { return ++at < nodes.length; }, get currentNode() { return nodes[at]; } };
    } };
  const context = vm.createContext({ D, S: { view: 'shelf', taken: [], deepWords: {}, dials: { kanji: 0, furigana: 1 } },
    document, NodeFilter: { SHOW_TEXT: 4 }, Intl, window: { innerWidth: 400 },
    tx: (_ja, en) => en, el: (tag, cls, value) => new Element(tag, cls, value),
    biLabel: (tag, cls, _ja, en) => new Element(tag, cls, en),
    removeMini: () => body.querySelector('#mini')?.remove(), activeTokenAlternatives: null, articleNarration: null,
    ensureDictionaryRowsForForm: async () => [], wordCaptureState: () => 'take',
    readerCaptureReasonText: () => 'No confirmed meaning to save', readerGlossMissText: () => 'No confirmed meaning',
    openVocabularyListChooser: node => chosen.push(copy(node)), go: node => opened.push(copy(node)),
    excerptListenLabel: () => { throw new Error('This lookup suite must not enter audio controls'); } });
  vm.runInContext(program, context);
  const open = async (surface, details = {}) => {
    const anchor = new Element('button', '', surface); body.append(anchor);
    await context.openJapaneseLookup(anchor, surface, details);
    return body.querySelector('#mini');
  };
  return { context, body, document, opened, chosen, open };
}

test('Auxiliary ます never borrows 升; its unresolved full-entry door cannot reopen that entry', async () => {
  const f = app();
  assert.equal(dict['ます'], undefined);
  assert(index.entries.some(row => row[1] === '升' && row[5].includes('ます')));
  const mini = await f.open('ます', { reading: 'ます', pos: '助動詞' });
  assert.equal(find(mini, 'mini-word').textContent, 'ます');
  assert.equal(find(mini, 'mini-reading').textContent, 'ます');
  assert.equal(find(mini, 'mini-gloss').textContent, '(no gloss yet)');
  assert.equal(find(mini, 'mini-take').disabled, true);
  await find(mini, 'mini-take').click();
  assert.deepEqual(f.chosen, []);
  assert.equal(find(mini, 'mini-entry').disabled, true, 'No unresolved spelling-only route may reopen 升');
  await find(mini, 'mini-entry').click();
  assert.deepEqual(f.opened, []);
});

test('A plain kana segment しま stays on its exact dictionary spelling, never 島 or 縞', async () => {
  const f = app(); const mini = await f.open('しま');
  assert.equal(find(mini, 'mini-word').textContent, 'しま');
  assert.equal(find(mini, 'mini-gloss').textContent, 'will do');
  await find(mini, 'mini-take').click();
  assert.deepEqual(f.chosen, [{ t: 'word', id: 'しま', seq: '2861315', reading: 'しま' }]);
  await find(mini, 'mini-entry').click();
  assert.deepEqual(f.opened, [{ t: 'word', id: 'しま', seq: '2861315', reading: 'しま' }]);
});

test('The supplied reading selects a same-spelled entry and survives popup, save and full entry', async () => {
  for (const fixture of [
    { word: '上手', reading: 'うわて', gloss: 'upper part', seq: '1580400' },
    { word: '日本', reading: 'にっぽん', gloss: 'Japan', seq: '1582710' },
    { word: '市場', reading: 'しじょう', gloss: 'market (financial, stock, domestic, etc.)', seq: '1308305' },
  ]) {
    const f = app(), mini = await f.open(fixture.word, { reading: fixture.reading, pos: '名詞' });
    assert.equal(find(mini, 'mini-word').textContent, fixture.word);
    assert.equal(find(mini, 'mini-reading').textContent, fixture.reading);
    assert.equal(find(mini, 'mini-gloss').textContent, fixture.gloss);
    await find(mini, 'mini-take').click(); await find(mini, 'mini-entry').click();
    const expected = { t: 'word', id: fixture.word, seq: fixture.seq, reading: fixture.reading };
    assert.deepEqual(f.chosen, [expected]); assert.deepEqual(f.opened, [expected]);
  }
});

test('Missing and mismatched readings cannot fall through to a different core answer, even offline', async () => {
  for (const withIndex of [true, false]) for (const fixture of [
    { word: '五六', reading: 'ごろく' }, { word: '上手', reading: 'ありえないよみ' },
  ]) {
    const f = app({ withIndex }), mini = await f.open(fixture.word, { reading: fixture.reading });
    assert.equal(find(mini, 'mini-reading').textContent, fixture.reading);
    assert.equal(find(mini, 'mini-gloss').textContent, '(no gloss yet)');
    assert.equal(find(mini, 'mini-take').disabled, true);
    assert.equal(find(mini, 'mini-entry').disabled, true);
  }
});

test('Known kana and kanji core words keep their existing save route; unresolved kanji keeps its character door', async () => {
  for (const word of ['わかる', '谷川']) {
    const f = app(), mini = await f.open(word);
    assert.equal(find(mini, 'mini-gloss').textContent, dict[word].m[0]);
    assert.equal(find(mini, 'mini-take').disabled, false);
    await find(mini, 'mini-take').click(); assert.deepEqual(f.chosen, [{ t: 'word', id: word }]);
  }
  const f = app(); f.context.D.kanji['産'] = {};
  const mini = await f.open('産', { reading: 'さん' });
  assert.equal(find(mini, 'mini-entry').disabled, false);
  await find(mini, 'mini-entry').click(); assert.deepEqual(f.opened, [{ t: 'kanji', id: '産' }]);
});

test('The prose enhancer skips writing-room instructions while keeping existing word and character controls', async () => {
  const f = app(), root = new Element('section', 'stroke-page');
  const hint = new Element('p', 'stroke-hint'); hint.append(text('触れて、もう一度'));
  const unavailable = new Element('section', 'stroke-missing'), note = new Element('p'); note.append(text('筆順がありません')); unavailable.append(note);
  const meta = new Element('p', 'stroke-meta'), kanji = new Element('button', 'stroke-meta-link', '漢検 ５級');
  let presses = 0; kanji.addEventListener('click', () => { presses += 1; }); meta.append(kanji);
  const prose = new Element('p', 'word-note'); prose.append(text('谷川'));
  root.append(hint, unavailable, meta, prose); f.body.append(root);
  f.context.enhanceJapaneseProse(root);
  assert.equal(hint.querySelectorAll('button').length, 0);
  assert.equal(unavailable.querySelectorAll('button').length, 0);
  assert.equal(meta.querySelectorAll('button').length, 1); await kanji.click(); assert.equal(presses, 1);
  assert.equal(prose.querySelectorAll('.japanese-lookup-word').length, 1, 'Content prose remains a lookup door');
});

test('Each prose block is one Tab stop of plain-word names sharing one keyboard help', () => {
  const f = app(), root = new Element('section');
  const first = new Element('p'); first.append(text('谷川で会議を始めました。'));
  const second = new Element('p'); second.append(text('分かりました。'));
  root.append(first, second); f.body.append(root);
  f.context.enhanceJapaneseProse(root);
  for (const block of [first, second]) {
    const words = block.querySelectorAll('.japanese-lookup-word');
    assert(words.length > 1, 'The fixture block has several words');
    assert.deepEqual(words.map(word => word.tabIndex), [0, ...words.slice(1).map(() => -1)]);
    for (const word of words) {
      assert.equal(word.getAttribute('aria-label'), null, 'The visible word is its own name');
      assert.equal(word.getAttribute('aria-describedby'), 'japanese-lookup-help');
    }
  }
  const help = f.body.querySelectorAll('#japanese-lookup-help');
  assert.equal(help.length, 1);
  assert.equal(help[0].hidden, true);
  assert(!root.textContent.includes(help[0].textContent), 'The help stays outside the prose it describes');
});
