/** Actual lookup/mini/prose functions over the bundled dictionary, lifted by the repository's
 * existing TypeScript-AST seam. The small DOM below supplies events/tree walking only; no browser,
 * record persistence, network, audio, or grading is simulated. A resolved save is observed at the
 * one-tap save boundary (toggleWordSave), including its exact word/sequence/reading. */
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
  'enhanceJapaneseProse', 'showMini', 'wordSaveFacts', 'paintWordSave', 'paintMiniPath', 'placeFloating', 'revealFloatingFocus', 'keepFloatingBeside', 'miniAnchor', 'SAVE_PRESS_MS', 'lookupBlockWords', 'setLookupStop', 'japaneseLookupHelpId', 'lookupOccurrence',
  'lookupItemBlocks', 'findLookupOccurrence', 'japaneseLookupMini', 'lookupWordKey',
  // the one-hand pass: the slip's dive into the entry and the close callback every surface hears
  'slipDive', 'miniDiving', 'miniOnClose', 'slipSummons',
  // G1 (2026-10-16): a slip stands only beside a word on the top layer, a slip leaving into its page is not standing, and
  // its headword is the match cut's source
  'slipAllowed', 'standingSlip', 'slipHeadword',
  // S (2026-10-16): the slip's Save is the one Save, built by one component (saveOne) for every keep in the app
  'saveOne',
  // R2 (2026-10-17): a reader word's sound change, at the lookup door and the reader's (Codex's f2e3015e review: 仏 ぶっ)
  'soundChangeReadings', 'SOUND_VOICED', 'SOUND_PLAIN', 'kanjiReadingsOf', 'readerLookupAnswer', 'dictionaryAnsweredForm',
  'soundChangeDoor', 'dictionaryRowsReadAs', 'readerReadingFits',
  // Q (2026-10-17): the slip stands clear of its word with the word's reading (anchorBox); lookup prose keeps each word's
  // doors in one no-break unit, by the app's one word rule (jaGroupSegments); the bar's Save fits its bar (fitChromeKeep)
  'anchorBox', 'fitChromeKeep', 'chromeKeepFitting', 'jaGroupSegments', 'jaMendSegments', 'JA_KANA_WORDS', 'JA_KANJI', 'JA_KANA_RUN',
  'JA_COUNTER', 'JA_OPENS_WORD', 'JA_CLOSES',
  // G3 (2026-10-18): a tap climbs the word's ladder (activateWordLadder: reading, stage, page); a phonetic parenthetical is
  // no door (phoneticAnnotationRanges); a prose block is one roving stop (installProseWordRoving)
  'activateWordLadder', 'clearWordLadder', 'ladderVisit', 'ladderReturning', 'readingSlipSerial',
  'phoneticAnnotationRanges', 'phoneticAnnotationCandidates', 'installProseWordRoving', 'proseWordRovers',
  // R3 (2026-10-18): the sense a word's text uses — the lookup's entry before its sense, the record its sense shapes, the
  // slip's second line, and the marks the slip leaves (for the page, and for a sense still to come)
  'japaneseLookupEntryRecord', 'senseRecord', 'senseIsQuick', 'senseMoreLine', 'SENSE_BY_ANCHOR', 'SENSE_LATER', 'senseLaterDraw', 'sensePatch', 'SLIP_NODE', 'senseMoreElement'];
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
const kanjiTable = JSON.parse(readFileSync(new URL('../data/share_alike/kanji.json', import.meta.url), 'utf8')).kanji;
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
  get lastChild() { return this.children[this.children.length - 1] ?? null; }
  set textContent(text) { this.ownText = text; this.children = []; }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parentElement = this; } }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(kind, handler) { (this.listeners[kind] ||= []).push(handler); }
  async click() { if (!this.disabled) for (const handler of this.listeners.click || []) await handler({ stopPropagation() {}, detail: 0 }); }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector === '[data-japanese-lookup]') return this.dataset.japaneseLookup !== undefined;
    if (selector === '[data-lookup-item]') return this.dataset.lookupItem !== undefined;
    if (selector === '[data-lookup-block]') return this.dataset.lookupBlock !== undefined;
    // G3's roving reads its paragraph by [data-prose-roving] and asks whether a block is div or span
    if (selector.includes(',')) return selector.split(',').some(one => this.matches(one.trim()));
    if (/^\[data-[a-z-]+\]$/.test(selector)) return selector.slice(6, -1).replace(/-([a-z])/g, (_m, c) => c.toUpperCase()) in this.dataset;
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
  // data-* attributes live in dataset here, as the browser reflects them
  hasAttribute(name) { return name.startsWith('data-') ? name.slice(5).replace(/-([a-z])/g, (_m, c) => c.toUpperCase()) in this.dataset : name in this.attributes; }
  contains(node) { for (let at = node; at; at = at.parentElement) if (at === this) return true; return false; }
  focus() {}
  remove() { this.isConnected = false; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); }
}
const find = (node, className) => node.querySelector('.' + className);
const text = value => new Element('#text', '', value);

function app({ withIndex = true, withKanji = false } = {}) {
  const body = new Element('body'), opened = [], chosen = [], menus = [];
  const D = { dict, words, kanji: withKanji ? copy(kanjiTable) : {}, dictionaryIndex: withIndex ? index : null,
    dictionaryByForm: new Map(), dictionaryCompleteForms: new Set(), dictionaryBySeq: new Map() };
  const document = { body, querySelectorAll: selector => body.querySelectorAll(selector),
    getElementById: id => body.querySelector(`#${id}`),
    createTextNode: text, createDocumentFragment: () => new Element('#fragment'), createElement: tag => new Element(tag),
    createTreeWalker(parent) {
      const nodes = [];
      const visit = node => { for (const child of node.children) { if (child.tag === '#text') nodes.push(child); visit(child); } };
      visit(parent); let at = -1;
      return { nextNode() { return ++at < nodes.length; }, get currentNode() { return nodes[at]; } };
    } };
  // G3 · the reading dial shows readings, so a tap goes straight to the word's stage (activateWordLadder skips the reading
  // rung when readings are off or always shown); verify-word-grammar pins every rung in both engines
  const context = vm.createContext({ D, S: { view: 'shelf', taken: [], deepWords: {}, dials: { kanji: 0, furigana: 2 } },
    document, NodeFilter: { SHOW_TEXT: 4 }, Intl, window: { innerWidth: 400 }, queueMicrotask,
    // G3's ladder touches device Back's sentinel, the top bar's keep and the room's re-render, and wires the word menu's
    // gestures: those are the browser's and other rooms' (their own verifiers), stubbed at their boundary here
    syncWalkSentinel: () => {}, syncChromeKeep: () => {}, refreshLadderRoom: () => {}, wireReaderWordMenu: () => {},
    // the page's match cut is the browser's motion (Element.animate, reduced motion): none here
    pageCutAllowed: () => false,
    tx: (_ja, en) => en, el: (tag, cls, value) => new Element(tag, cls, value),
    biLabel: (tag, cls, _ja, en) => new Element(tag, cls, en),
    removeMini: () => body.querySelector('#mini')?.remove(), activeTokenAlternatives: null, articleNarration: null,
    // G1's frame sampler and the page built at idle are the browser's (frames, idle callbacks), not the slip's logic
    sampleTransition: () => {}, sampleWhere: () => '', schedulePagePrebuild: () => {},
    ensureDictionaryRowsForForm: async () => [], wordCaptureState: () => 'take',
    readerCaptureReasonText: () => 'No confirmed meaning to save', readerGlossMissText: () => 'No confirmed meaning',
    toggleWordSave: node => chosen.push(copy(node)), go: node => opened.push(copy(node)),
    // Save ▾ opens its menu once the word is saved (1.3.0): the menu is observed at its boundary
    openVocabularyListPopover: (node, label, invoker, options) => menus.push({ node: copy(node), label, invoker: invoker?.id, menu: !!options?.menu }),
    excerptListenLabel: () => { throw new Error('This lookup suite must not enter audio controls'); } });
  vm.runInContext(program, context);
  const open = async (surface, details = {}) => {
    const anchor = new Element('button', '', surface); body.append(anchor);
    await context.openJapaneseLookup(anchor, surface, details);
    return body.querySelector('#mini');
  };
  return { context, body, document, opened, chosen, menus, open };
}

test('Auxiliary ます never borrows 升; its unresolved full-entry door cannot reopen that entry', async () => {
  const f = app();
  assert.equal(dict['ます'], undefined);
  assert(index.entries.some(row => row[1] === '升' && row[5].includes('ます')));
  const mini = await f.open('ます', { reading: 'ます', pos: '助動詞' });
  assert.equal(find(mini, 'mini-word').textContent, 'ます');
  // L · a word written exactly as it is read does not say itself twice: ます has no reading line (a kanji word in this
  // same run keeps its own, at the end of this test, so hiding every reading cannot pass)
  assert.equal(find(mini, 'mini-reading'), null, 'ます, written as it is read, shows no reading line');
  assert.equal(find(mini, 'mini-gloss').textContent, 'No dictionary entry for this spelling.');
  assert.equal(find(mini, 'mini-take').disabled, true);
  await find(mini, 'mini-take').click();
  assert.deepEqual(f.chosen, []);
  // the word is the door into its full entry (1.3.0); an unresolved spelling's word is plain text, no door
  assert.equal(find(mini, 'mini-word').tag, 'span', 'No unresolved spelling-only route may reopen 升');
  assert.equal(mini.querySelectorAll('button').filter((b) => b.dataset.action === 'entry.open').length, 0);
  await find(mini, 'mini-word').click();
  assert.deepEqual(f.opened, []);
  // the same run, a kanji word: its reading line is still there (上手 read うわて)
  const kanji = await f.open('上手', { reading: 'うわて', pos: '名詞' });
  assert.equal(find(kanji, 'mini-word').textContent, '上手');
  assert.equal(find(kanji, 'mini-reading')?.textContent, 'うわて', 'a kanji word keeps its reading line');
});

test('A plain kana segment しま stays on its exact dictionary spelling, never 島 or 縞', async () => {
  const f = app(); const mini = await f.open('しま');
  assert.equal(find(mini, 'mini-word').textContent, 'しま');
  assert.equal(find(mini, 'mini-gloss').textContent, 'will do');
  await find(mini, 'mini-take').click();
  assert.deepEqual(f.chosen, [{ t: 'word', id: 'しま', seq: '2861315', reading: 'しま' }]);
  // Save ▾: the save is followed by its menu, for the same word
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(f.menus, [{ node: { t: 'word', id: 'しま', seq: '2861315', reading: 'しま' }, label: 'しま', invoker: 'mini-take', menu: true }]);
  assert.equal(find(mini, 'mini-word').dataset.action, 'entry.open');
  await find(mini, 'mini-word').click();
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
    await find(mini, 'mini-take').click(); await find(mini, 'mini-word').click();
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
    // R2 (2026-10-17): a spelling the full dictionary lists, read otherwise than every entry, says so ("…this reading");
    // one it does not list at all, or with no full dictionary to ask, keeps "…this spelling"
    const listed = withIndex && index.entries.some((row) => row[1] === fixture.word || row[4].includes(fixture.word) || row[5].includes(fixture.word));
    assert.equal(find(mini, 'mini-gloss').textContent, listed ? 'No dictionary entry for this reading.' : 'No dictionary entry for this spelling.');
    assert.equal(find(mini, 'mini-take').disabled, true);
    assert.equal(find(mini, 'mini-word').tag, 'span', 'an unresolved word has no door into an entry');
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
  assert.equal(find(mini, 'mini-word').tag, 'button');
  await find(mini, 'mini-word').click(); assert.deepEqual(f.opened, [{ t: 'kanji', id: '産' }]);
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
  // G3 · the block itself is the one Tab stop (installProseWordRoving): its words are plain spans, retired until the arrows
  // select one, each named by its own visible text, and the block carries the shared help (the word keeps it for when
  // it is selected)
  for (const block of [first, second]) {
    const words = block.querySelectorAll('.japanese-lookup-word');
    assert(words.length > 1, 'The fixture block has several words');
    assert.equal(block.dataset.proseRoving, 'true');
    assert.equal(block.tabIndex, 0, 'The block is the one Tab stop');
    assert(String(block.getAttribute('aria-describedby')).split(' ').includes('japanese-lookup-help'));
    for (const word of words) {
      assert.equal(word.tag, 'span', 'A word is a plain span, not a button');
      assert(word.tabIndex !== 0 && !('tabindex' in word.attributes), 'A word is never its own Tab stop');
      assert.equal(word.getAttribute('role'), 'presentation', 'An unselected word is not its own group');
      assert.equal(word.getAttribute('aria-label'), null, 'The visible word is its own name');
      assert.equal(word.dataset.lookupText, word.textContent);
      assert.equal(word.dataset.proseDescription, 'japanese-lookup-help');
    }
  }
  const help = f.body.querySelectorAll('#japanese-lookup-help');
  assert.equal(help.length, 1);
  assert.equal(help[0].hidden, true);
  assert(!root.textContent.includes(help[0].textContent), 'The help stays outside the prose it describes');
});

test('R2 · a sound change keeps the text\'s voicing first: 仏 read ぶっ is the kanji (its on\'yomi ぶつ), never 仏 ふつ, France', () => {
  const f = app({ withKanji: true });
  f.context.D.dictionaryMode = 'main';
  const plain = (value) => (value ? JSON.parse(JSON.stringify(value)) : value);
  const answer = (word, reading) => plain(f.context.readerLookupAnswer(word, { reading }));
  const door = (word, reading) => plain(f.context.soundChangeDoor({ s: word, b: word, r: reading, p: '名詞', c: true }));
  // the premise: the quick dictionary reads 仏 ふつ, "France"; no entry reads 仏 ぶつ (nor ぶっ); ぶつ is one of 仏's on'yomi
  assert.equal(dict['仏'].r, 'ふつ');
  assert.equal(dict['仏'].m[0], 'France');
  assert(!index.entries.some((row) => (row[1] === '仏' || row[4].includes('仏')) && row[5].some((kana) => ['ぶつ', 'ぶっ'].includes(kana))));
  assert(kanjiTable['仏'].on.includes('ブツ'));
  // the lookup door and the reader's door: the kanji, never the voicing change's France
  assert.deepEqual(answer('仏', 'ぶっ'), { kanjiOnly: true });
  assert.deepEqual(door('仏', 'ぶっ'), { s: '仏', b: '仏', r: 'ぶっ', p: '名詞', c: true, kanjiOnly: true });
  // the same rule still restores what the text's voicing allows, and a voicing change where nothing else does (so a door
  // answering nothing cannot pass): 一 read いっ is 一 いち, 本 read ぽん is 本 ほん; 仏 read ぶつ stays the kanji
  assert.deepEqual(answer('一', 'いっ'), { reading: 'いち', shown: 'いっ' });
  assert.deepEqual(answer('本', 'ぽん'), { reading: 'ほん', shown: 'ぽん' });
  assert.deepEqual(answer('仏', 'ぶつ'), { kanjiOnly: true });
  assert.deepEqual(door('一', 'いっ'), { s: '一', b: '一', r: 'いち', p: '名詞', c: true, shown: 'いっ' });
  assert.deepEqual(door('本', 'ぽん'), { s: '本', b: '本', r: 'ほん', p: '名詞', c: true, shown: 'ぽん' });
});
