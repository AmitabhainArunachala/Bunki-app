import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Actual shipped renderer/handlers, deterministic DOM + async/storage seams.
// This proves status/ownership only; it cannot prove native press geometry.
const source = readFileSync(new URL('../corridor.js', import.meta.url), 'utf8');
function extract(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a && source.indexOf(start, a + 1) < 0, `unique boundary ${start}`);
  return source.slice(a, b);
}
const renderer = extract('function renderTextSourceContextSelection(', '\n/** Whether this sentence already stands');
const fold = extract('let menuFoldPending = null;', '\n/** The press or keyboard activation on the word whose popup is open:');
const copy = {
  O1: 'Choose text in this reading before opening it.',
  O2: 'An action for this selection is already in progress.',
  O3: 'This record is not writable. The selected text was not opened.',
  O4: 'The record changed while opening. Select the text again.',
  O5: 'Opening stopped because the save was not confirmed.',
  O6: 'The record changed after the save attempt; opening stopped.',
  O7: 'The reading changed before opening finished. Return to the reading and select the text again.',
  O8: 'A newer action took over, so the earlier action did not open the text.',
  O9: 'The selected text could not be opened. Reopen the reading and select the text again.',
  working: 'Opening selected text…',
};
const savedCopy = 'Saved with its source.';
const clone = value => JSON.parse(JSON.stringify(value));
const drain = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function harness({ personal = false, code = renderer, language = 'en', text = '町で雨を見る。' } = {}) {
  let selection = null, navigation = 0, commits = 0, writes = 0, refreshed = 0;
  const pauses = new Map(), visits = [], patches = [], created = [], nodes = [];
  class Node {
    constructor(tag, cls = '', text = '') {
      this.tag = tag; this.className = cls || ''; this.text = text || ''; this.children = []; this.parentNode = null;
      this.listeners = new Map(); this.dataset = {}; this.history = []; this.attrs = new Map(); nodes.push(this);
      const classes = () => this.className.split(' ').filter(Boolean);
      this.classList = { contains: c => classes().includes(c),
        add: c => { this.className = [...new Set([...classes(), c])].join(' '); },
        remove: c => { this.className = classes().filter(x => x !== c).join(' '); },
        toggle: (c, force) => { const on = force ?? !this.classList.contains(c);
          this.classList[on ? 'add' : 'remove'](c); return on; } };
    }
    get isConnected() { return this === root || !!this.parentNode?.isConnected; }
    get parentElement() { return this.parentNode; }
    get childNodes() { return this.children; }
    get tagName() { return this.tag.toUpperCase(); }
    hasAttribute(k) { return this.attrs.has(k); }
    removeAttribute(k) { this.attrs.delete(k); }
    focus() {}
    scrollIntoView() {}
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { assert.equal(typeof value, 'string', 'status/text must remain real copy');
      this.replaceChildren(); this.text = value; this.history.push(value); }
    set disabled(value) { this.isDisabled = value; refreshed++; }
    get disabled() { return this.isDisabled; }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.get(k) ?? null; }
    append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child); } }
    prepend(child) { child.remove(); child.parentNode = this; this.children.unshift(child); }
    replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this.text = ''; this.append(...children); }
    replaceWith(...children) { const parent = this.parentNode; if (!parent) return;
      for (const child of children) child.remove();
      const index = parent.children.indexOf(this); parent.children.splice(index, 1, ...children);
      for (const child of children) child.parentNode = parent; this.parentNode = null; }
    remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      if (selector === '[hidden]') return !!this.hidden;
      if (selector === '[inert]') return !!this.inert;
      if (selector.startsWith('[data-')) { const [key, value] = selector.slice(6, -1).split('=');
        const prop = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return prop in this.dataset && (value === undefined || this.dataset[prop] === value.replaceAll('"', '')); }
      const [tag, cls] = selector.split('.'); return this.tag === tag && (!cls || this.classList.contains(cls));
    }
    closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
    querySelectorAll(selector) { const direct = selector.startsWith(':scope > '); if (direct) selector = selector.slice(9);
      return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...(direct ? [] : child.querySelectorAll(selector))]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(type, fn) { const set = this.listeners.get(type) || new Set(); set.add(fn); this.listeners.set(type, set); }
    emit(type, event = {}) { event.target ||= this; return [...(this.listeners.get(type) || [])].map(fn => fn(event)); }
    click() { this.emit('click'); }
  }
  const root = new Node('main'), body = new Node('article', '', text); root.id = 'main';
  body.id = personal ? 'source-reader-body' : 'publisher-body'; root.append(body);
  const saved = { id: 'personal-1', receiptSha256: 'publisher-1', encounterUrl: 'https://source.test/personal',
    candidate: { article: { title: 'Reading', body: { text: body.textContent, contentSha256: 'body-digest' },
      source: { attribution: 'The source author' }, canonicalUrl: 'https://source.test/publisher',
      capabilities: { 'quote-extract': { status: 'allowed', basis: 'attested' } } } } };
  let live = clone(saved), queued = null, parserThrows = false;
  async function boundary(name) {
    visits.push(name);
    const pause = pauses.get(name);
    if (pause) { pauses.delete(name); pause.entered.resolve(); await pause.release.promise; if (pause.error) throw pause.error; }
  }
  const module = {
    async digestText(text) { assert.equal(text, saved.candidate.article.body.text); await boundary('digest'); return 'body-digest'; },
    async createTeacherContext(input) { created.push(clone(input)); await boundary('create'); return input; },
    selectTeacherContext: (previous, context) => ({ ...previous, entries: [context], activeRef: 'selected' }),
    activateTeacherContext: (record, activeRef) => ({ ...record, activeRef }),
    async sourceSentenceContext(context) { await boundary('sentence'); return context; },
  };
  const selectSource = rootValue => { if (parserThrows) throw Error('invalid-source-record'); return rootValue?.entry || null; };
  const context = {
    publisherSelectionSurface: null, recordEpoch: 7, pageEpoch: 1, teacherContextSelectionSerial: 0, writable: true,
    S: { view: personal ? 'source-reader' : 'publisher', publisherReceipt: saved.receiptSha256, sourceCaptureId: saved.id,
      publisherLibrary: { get entry() { return clone(live); } }, sourceInbox: { get entry() { return clone(live); } },
      teacherContexts: { entries: [], activeRef: 'previous' }, stack: [] },
    AI_CHAT_PAGE: 'chat', tx: (ja, en) => language === 'ja' ? ja : en,
    el: (tag, cls, text) => new Node(tag, cls, text), biLabel: (tag, cls, _ja, en) => new Node(tag, cls, en),
    saveOne(options) { const button = new Node('button'); button.id = options.id; button.options = options; return button; },
    paintWordSave() {}, copyReaderText() {}, appendTranscriptTime() {}, appendFileSourceRange() {},
    sentencePracticeModule: {}, teacherContextModule: module,
    publisherModule: { selectPublisherReading: selectSource },
    sourceInboxModule: { selectSourceCapture: selectSource, selectListeningTranscript: () => null, selectFileCapture: () => null },
    ensureTeacherContextModule: async () => { await boundary('module'); return module; },
    resolveTeacherSource: async () => { await boundary('resolve'); },
    declineWrite: reason => Object.assign(Error('producer-declined'), { code: 'producer-declined', reason }),
    recordWritable: (epoch = context.recordEpoch) => context.writable && epoch === context.recordEpoch,
    recordReady: (epoch = context.recordEpoch) => epoch === context.recordEpoch,
    async commitStorePatch(produce) {
      commits++; await boundary('commit-queued');
      let patch;
      try {
        const authority = queued || live;
        patch = produce({ teacherContexts: clone(context.S.teacherContexts), publisherLibrary: { entry: clone(authority) }, sourceInbox: { entry: clone(authority) } });
      } catch (error) { if (error.code === 'producer-declined') return false; throw error; }
      assert.deepEqual(Object.keys(patch), ['teacherContexts'], 'No unrelated learner, debt or provider patch');
      patches.push(clone(patch)); if (!context.refuseCommit) writes++;
      await boundary('commit-after');
      // The product's existing boolean view also returns false after an applied but unacknowledged/uncertain write.
      return !context.refuseCommit && !context.unacknowledged && !context.uncertain;
    },
    keepScroll() {}, stopReadAloud() {}, render() { navigation++; context.pageEpoch++; root.replaceChildren(); },
    openSearchPage() { navigation++; context.S.view = 'search'; },
    teacherSourceError: () => 'Legacy Save/practice source error',
    window: { getSelection: () => selection, scrollTo() {}, scrollY: 123 }, document: {},
  };
  runInNewContext(code + '\nthis.draw = renderTextSourceContextSelection;', context, { timeout: 1000 });
  function draw() { context.draw(root, clone(live), body, personal); return context.publisherSelectionSurface; }
  draw();
  const prefix = personal ? 'source' : 'publisher';
  const find = suffix => nodes.findLast(node => node.isConnected && node.id === `${prefix}-${suffix}`);
  function select(start = 0, end = 1) {
    selection = { rangeCount: 1, isCollapsed: false, getRangeAt: () => ({ startContainer: body, endContainer: body,
      startOffset: start, toString: () => body.textContent.slice(start, end),
      cloneRange: () => ({ selectNodeContents() {}, setEnd() {}, toString: () => body.textContent.slice(0, start) }) }) };
    context.publisherSelectionSurface.update();
  }
  const pause = name => { const held = { entered: deferred(), release: deferred(), error: null }; pauses.set(name, held); return held; };
  return { context, root, body, saved, nodes, patches, created, visits, select, pause, find, Node,
    get surface() { return context.publisherSelectionSurface; },
    get status() { return find('context-status'); },
    get live() { return live; }, set live(value) { live = value; },
    queue(value) { queued = value; }, parserError(value = true) { parserThrows = value; },
    open() { const button = find('context-open'); button.emit('click'); return context.publisherSelectionSurface.state.pending; },
    save() { return find('context-save').options.keep(); },
    practice() { return find('sentence-practice').emit('click')[0]; },
    lookup() { return find('selection-lookup').emit('click')[0]; },
    repaint() { root.children.filter(n => n !== body).forEach(n => n.remove()); context.pageEpoch++; return draw(); },
    counts: () => ({ navigation, commits, writes, refreshed }),
  };
}

for (const personal of [false, true]) {
  test(`${personal ? 'personal' : 'publisher'}: Open keeps exact context once and navigates; explicit Save only saves`, async () => {
    const h = harness({ personal }); h.select(0, 3); const status = h.status;
    const operation = h.open(); assert.equal(status.textContent, copy.working); await drain();
    assert.equal(operation.outcome, 'opened'); assert.equal(h.counts().navigation, 1); assert.equal(h.counts().writes, 1);
    assert.equal(h.patches[0].teacherContexts.activeRef, 'selected');
    assert.deepEqual(h.created[0], { sourceKind: personal ? 'personal-reading' : 'publisher-reading',
      sourceId: personal ? 'personal-1' : 'publisher-1', sourceDigest: 'body-digest', unit: 'utf16-code-unit',
      start: 0, end: 3, quote: '町で雨', index: 0, title: 'Reading', attribution: 'The source author',
      url: `https://source.test/${personal ? 'personal' : 'publisher'}`, target: null });
    assert(!status.history.includes(savedCopy), 'Open never falls through to Saved');
    const s = harness({ personal }); s.select(); assert.equal(await s.save(), true);
    assert.equal(s.status.textContent, savedCopy); assert.equal(s.counts().navigation, 0);
    assert.equal(s.patches[0].teacherContexts.activeRef, 'previous');
    assert.equal(s.surface.state.pending, null); assert.equal(s.find('context-open').disabled, false);
    assert.equal(s.find('context-save').options.saved(), true);
  });
}

test('guard feedback: no selection, read-only, and unconfirmed commit are exact; no unproved saved claim', async () => {
  const h = harness(); h.status.textContent = savedCopy; h.open(); assert.equal(h.status.textContent, copy.O1);
  h.select(); h.context.writable = false; h.open(); assert.equal(h.status.textContent, copy.O3);
  assert.equal(h.context.teacherContextSelectionSerial, 0); assert.equal(h.counts().commits, 0);
  h.context.writable = true; h.context.refuseCommit = true; const op = h.open(); await drain();
  assert.equal(op.outcome, 'O5'); assert.equal(h.status.textContent, copy.O5); assert.equal(h.counts().navigation, 0);
});

for (const stage of ['module', 'digest', 'create', 'resolve', 'commit-queued', 'commit-after']) {
  test(`epoch lost at ${stage}: classify without painting the old record or navigating`, async () => {
    const h = harness(); h.select(); const held = h.pause(stage), op = h.open(); await held.entered.promise;
    const status = h.status; h.context.recordEpoch++; status.textContent = 'New record owns this notice.';
    held.release.resolve(); await drain();
    assert.equal(op.outcome, stage.startsWith('commit-') ? 'O6' : 'O4');
    assert.equal(status.textContent, 'New record owns this notice.'); assert.equal(h.counts().navigation, 0);
    assert.equal(h.counts().writes, stage === 'commit-after' ? 1 : 0); assert.equal(h.surface.state.pending, null);
  });
  test(`exception at ${stage}: neutral current Open outcome, never raw error or Saved`, async () => {
    const h = harness(); h.select(); const held = h.pause(stage), op = h.open(); await held.entered.promise;
    held.error = Error('SECRET arbitrary source error: saved'); held.release.resolve(); await drain();
    assert.equal(op.outcome, 'O9'); assert.equal(h.status.textContent, copy.O9);
    assert.equal(h.counts().navigation, 0); assert.equal(h.surface.state.pending, null);
  });
}

for (const after of [false, true]) test(`same epoch becomes unwritable ${after ? 'after' : 'before'} save attempt: exact notice`, async () => {
  const h = harness(); h.select(); const held = h.pause(after ? 'commit-after' : 'resolve'); h.open(); await held.entered.promise;
  h.context.writable = false; held.release.resolve(); await drain(); assert.equal(h.status.textContent, copy[after ? 'O6' : 'O4']);
});

for (const kind of ['open', 'save', 'practice', 'lookup']) test(`${kind} pending: Open re-entry changes no owner, generation, serial or write`, async () => {
  const h = harness({ personal: kind === 'lookup' }); h.select(); const held = h.pause('module');
  const task = h[kind](); await held.entered.promise; const owner = h.surface.state.pending;
  const generation = h.surface.state.generation, serial = h.context.teacherContextSelectionSerial;
  h.open(); assert.equal(h.surface.state.pending, owner); assert.equal(h.surface.state.generation, generation);
  assert.equal(h.context.teacherContextSelectionSerial, serial); assert.equal(h.status.textContent, copy.O2);
  assert.equal(h.counts().commits, 0); held.release.resolve(); await drain();
  if (task?.then) await task;
  assert.equal(h.counts().commits, ['open', 'save'].includes(kind) ? 1 : 0);
});

async function supersession(code = renderer, throwLate = false, oldKind = 'open') {
  const h = harness({ code }); h.select(); const held = h.pause('resolve'); h[oldKind](); await held.entered.promise;
  const old = h.surface.state.pending;
  h.select(2, 3); h.select(0, 1); // A -> B -> A cannot revive the first operation.
  assert.equal(old.outcome, 'O8');
  const nextHeld = h.pause('module'), next = h.open(); await nextHeld.entered.promise;
  const status = h.status, refreshes = h.counts().refreshed;
  assert.equal(status.textContent, copy.working);
  if (throwLate) held.error = Error('late failure'); held.release.resolve(); await drain();
  assert.equal(status.textContent, copy.working, 'Old completion must preserve the newer notice');
  assert.equal(h.surface.state.pending, next, 'Old finally must preserve the newer pending owner');
  assert.equal(h.find('context-open').disabled, true, 'Old finally must not enable newer controls');
  assert.equal(h.counts().refreshed, refreshes, 'Old finally must not repaint newer controls');
  assert.equal(h.counts().writes, 0, 'Superseded source must not reach the writer');
  nextHeld.release.resolve(); await drain(); assert.equal(next.outcome, 'opened'); assert.equal(h.counts().writes, 1);
}
for (const fails of [false, true])
  test(`Open A-B-A / newer pending survives late ${fails ? 'error' : 'success'} and finally`, () => supersession(renderer, fails));

async function capturedSelection(kind, code = renderer) {
  const h = harness({ personal: kind === 'lookup', code }); h.select(); const held = h.pause('resolve'); const task = h[kind](); await held.entered.promise;
  const owner = h.surface.state.pending; h.select(2, 3); const status = h.status; status.textContent = 'Selection B owns this notice';
  assert.equal(h.surface.state.pending, owner, 'Changing selection must preserve explicit non-Open intent');
  const generation = h.surface.state.generation, serial = h.context.teacherContextSelectionSerial;
  h.open(); assert.equal(h.surface.state.pending, owner); assert.equal(h.surface.state.generation, generation);
  assert.equal(h.context.teacherContextSelectionSerial, serial); assert.equal(status.textContent, 'Selection B owns this notice');
  held.release.resolve(); await task;
  assert.equal(status.textContent, 'Selection B owns this notice'); assert.equal(owner.outcome, kind === 'save' ? 'saved' : kind);
  if (kind === 'save') {
    assert.equal(h.counts().writes, 1); assert.equal(h.patches[0].teacherContexts.entries[0].quote, '町');
    assert.equal(h.find('context-save').options.saved(), false, 'B was not saved');
    assert.equal(h.find('context-open').disabled, false);
    h.select(); assert.equal(h.find('context-save').options.saved(), true, 'keptAt still names A');
    assert.equal(h.counts().navigation, 0);
  } else {
    assert.equal(h.counts().navigation, 1); assert.equal(h.counts().writes, 0);
    assert.equal(kind === 'practice' ? h.context.S.sentencePracticeView.context.quote : h.context.S.navQ, '町');
  }
}
for (const kind of ['save', 'practice', 'lookup'])
  test(`${kind} keeps captured A after selecting B, but cannot publish over B`, () => capturedSelection(kind));

for (const kind of ['save', 'practice']) for (const fails of [false, true])
  test(`${kind} A-B-A keeps original intent but no old notice after late ${fails ? 'error' : 'success'}`, async () => {
    const h = harness(); h.select(); const held = h.pause('resolve'); const task = h[kind](); await held.entered.promise;
    const owner = h.surface.state.pending; h.select(2, 3); h.select();
    const status = h.status; status.textContent = 'Reselected A owns this notice';
    assert.equal(h.surface.state.pending, owner); if (fails) held.error = Error('late source failure');
    held.release.resolve(); await task;
    assert.equal(status.textContent, 'Reselected A owns this notice');
    assert.equal(owner.outcome, fails ? 'O9' : kind === 'save' ? 'saved' : 'practice');
    assert.equal(h.counts().writes, !fails && kind === 'save' ? 1 : 0);
    assert.equal(h.counts().navigation, !fails && kind === 'practice' ? 1 : 0);
    assert.equal(h.surface.state.pending, null);
    if (fails || kind === 'save') assert.equal(h.find('context-open').disabled, false);
  });

for (const field of ['text', 'digest', 'title', 'attribution', 'url', 'capability']) {
  for (const queued of [false, true]) test(`same ID, changed ${field} in ${queued ? 'queued authority (S unchanged)' : 'live record'} revokes publication`, async () => {
    const h = harness(); h.select(); const held = h.pause(queued ? 'commit-queued' : 'resolve'), op = h.open(); await held.entered.promise;
    const next = clone(h.live), article = next.candidate.article;
    if (field === 'text') article.body.text += '新';
    if (field === 'digest') article.body.contentSha256 = 'different-digest';
    if (field === 'title') article.title = 'Changed title';
    if (field === 'attribution') article.source.attribution = 'Another author';
    if (field === 'url') article.canonicalUrl += '/changed';
    if (field === 'capability') article.capabilities['quote-extract'].basis = 'different-basis';
    if (queued) h.queue(next); else h.live = next;
    const status = h.status, before = status.textContent, refreshes = h.counts().refreshed;
    held.release.resolve(); await drain(); assert.equal(op.outcome, 'O7'); assert.equal(h.counts().writes, 0);
    assert.equal(h.counts().navigation, 0); assert.equal(status.textContent, before, 'Revoked source must not publish a notice');
    assert.equal(h.counts().refreshed, refreshes, 'Revoked source must not enable stale controls');
  });
}

for (const kind of ['detach', 'route', 'serial', 'repaint', 'leave-return']) test(`${kind}: no stale navigation, status, or source revival`, async () => {
  const h = harness(); h.select(); const held = h.pause('commit-after'), op = h.open(); await held.entered.promise;
  const status = h.status;
  if (kind === 'detach') h.find('context-open').remove();
  if (kind === 'route') h.context.S.view = 'dictionary';
  if (kind === 'serial') h.context.teacherContextSelectionSerial++;
  if (kind === 'repaint') h.repaint();
  if (kind === 'leave-return') { h.context.S.view = 'dictionary'; h.context.pageEpoch++; h.context.S.view = 'publisher'; h.repaint(); }
  status.textContent = 'Unrelated or detached notice'; const refreshes = h.counts().refreshed;
  held.release.resolve(); await drain();
  assert.equal(op.outcome, ['repaint', 'leave-return'].includes(kind) ? 'surface-replaced' : ['serial', 'route'].includes(kind) ? 'O8' : 'O7');
  assert.equal(status.textContent, 'Unrelated or detached notice'); assert.equal(h.counts().navigation, 0);
  assert.equal(h.counts().writes, 1, 'Already issued save is not erased');
  if (['serial', 'detach'].includes(kind)) {
    assert(h.counts().refreshed > refreshes, 'Silent revocation releases this surface controls');
  } else assert.equal(h.counts().refreshed, refreshes);
  if (kind === 'repaint') { h.select(); const next = h.open(); await drain(); assert.equal(next.outcome, 'opened'); }
});

test('parser refusal cannot throw out of catch/finally or strand this lock', async () => {
  const h = harness(); h.select(); const held = h.pause('resolve'), op = h.open(); await held.entered.promise;
  const status = h.status, before = status.textContent; h.parserError(); held.release.resolve(); await drain();
  assert.equal(op.outcome, 'O7'); assert.equal(h.surface.state.pending, null); assert.equal(status.textContent, before);
  assert.doesNotThrow(() => h.open()); assert.equal(h.surface.state.lastOutcome.code, 'O7');
});

test('repeat unchanged selection/collapsed selection do not cancel; changed selection owns O8', async () => {
  const h = harness(); h.select(); const held = h.pause('resolve'), op = h.open(); await held.entered.promise;
  h.select(); assert.equal(h.surface.state.pending, op); assert.equal(h.status.textContent, copy.working);
  const get = h.context.window.getSelection; h.context.window.getSelection = () => ({ rangeCount: 0, isCollapsed: true });
  h.surface.update(); h.context.window.getSelection = get; assert.equal(h.surface.state.pending, op);
  h.select(2, 3); assert.equal(h.status.textContent, copy.O8); held.release.resolve(); await drain(); assert.equal(h.counts().writes, 0);
});

test('explicit Save failures do not use Open-specific copy or falsely say Saved', async () => {
  for (const refuses of [false, true]) {
    const h = harness(); h.select(); const held = h.pause('resolve'); const task = h.save(); await held.entered.promise;
    if (refuses) h.context.refuseCommit = true; else held.error = Error('bad source'); held.release.resolve();
    assert.equal(await task, false); assert(!Object.values(copy).includes(h.status.textContent));
    assert.notEqual(h.status.textContent, savedCopy); assert.equal(h.counts().navigation, 0);
  }
});

test('personal source identity includes encounter URL, not the publisher canonical URL', async () => {
  const h = harness({ personal: true }); h.select(); const held = h.pause('commit-queued'), op = h.open(); await held.entered.promise;
  const next = clone(h.live); next.encounterUrl += '/another'; h.queue(next);
  held.release.resolve(); await drain(); assert.equal(op.outcome, 'O7'); assert.equal(h.counts().writes, 0);
});

for (const outcome of ['unacknowledged', 'uncertain']) test(`${outcome} save may exist: confirmation-only O5 and no navigation`, async () => {
  const h = harness(); h.select(); h.context[outcome] = true; const op = h.open(); await drain();
  assert.equal(op.outcome, 'O5'); assert.equal(h.counts().writes, 1); assert.equal(h.status.textContent, copy.O5);
  assert.equal(h.counts().navigation, 0); assert(!h.status.history.includes(savedCopy));
});

async function sheetOwnership(inPlace, code = renderer) {
  const h = harness({ code }); h.select(); const held = h.pause('commit-after'), op = h.open(); await held.entered.promise;
  const entry = { kind: 'word', text: '町' };
  if (inPlace) h.context.S.stack.push(entry); else h.context.S.stack = [entry];
  const stack = h.context.S.stack, status = h.status; status.textContent = 'Sheet owns the learner’s attention';
  held.release.resolve(); await drain();
  assert.equal(op.outcome, 'O8'); assert.equal(h.context.S.stack, stack); assert.equal(h.context.S.stack[0], entry);
  assert.equal(h.counts().navigation, 0); assert.equal(status.textContent, 'Sheet owns the learner’s attention');
  assert.equal(h.find('context-open').disabled, false, 'Silent revocation must release its controls');
  h.context.S.stack = op.stack; h.context.S.stack.splice(0);
  assert.equal(h.find('context-open').disabled, false, 'Closing the sheet without room repaint leaves usable controls');
  const next = h.open(); await drain(); assert.equal(next.outcome, 'opened');
}
for (const inPlace of [false, true])
  test(`sheet opened during await (${inPlace ? 'same stack array' : 'new stack array'}) survives old Open`, () => sheetOwnership(inPlace));

test('practice sentence await and personal lookup await retain epoch/source ownership', async () => {
  const h = harness(); h.select(); const held = h.pause('sentence'); const task = h.practice(); await held.entered.promise;
  const op = h.surface.state.pending; h.context.recordEpoch++; held.release.resolve(); await task;
  assert.equal(op.outcome, 'O4'); assert.equal(h.counts().navigation, 0); assert.equal(h.surface.state.pending, null);
  const p = harness({ personal: true }); p.select(); const lookupHeld = p.pause('resolve'); const lookup = p.lookup(); await lookupHeld.entered.promise;
  p.context.S.view = 'dictionary'; lookupHeld.release.resolve(); await lookup;
  assert.equal(p.counts().navigation, 0); assert.equal(p.surface.state.pending, null);
});

async function practiceLengthNotice(changedSelection, code = renderer, language = 'en') {
  const h = harness({ code, language, text: '長'.repeat(201) + '短い' }); h.select(0, 201);
  const held = h.pause('sentence'), task = h.practice(); await held.entered.promise;
  const operation = h.surface.state.pending, status = h.status;
  assert.equal(operation.selected.quote, '長'.repeat(201));
  if (changedSelection) {
    h.select(201, 203); status.textContent = 'Selection B owns this notice';
    assert.equal(h.surface.state.pending, operation, 'Practice keeps captured A while B owns the notice');
  }
  const before = status.history.length;
  held.release.resolve(); await task;
  assert.equal(operation.outcome, 'invalid-practice-selection', 'Invalid A is classified even without notice ownership');
  assert.equal(status.textContent, changedSelection ? 'Selection B owns this notice' : language === 'ja'
    ? '練習したい語句を200文字以内で選ぶ。' : 'Select a phrase of at most 200 characters to practice.',
  'The late Practice warning must belong to the current selection');
  assert.equal(status.history.length - before, changedSelection ? 0 : 1);
  assert.equal(h.surface.state.selection.quote, changedSelection ? '短い' : '長'.repeat(201));
  assert.equal(h.counts().navigation, 0); assert.equal(h.counts().commits, 0); assert.equal(h.counts().writes, 0);
  assert.equal(h.surface.state.pending, null); assert.equal(h.find('context-open').disabled, false);
  assert.equal(h.find('sentence-practice').disabled, false);
}
test('Practice over200 A held at sentence await cannot overwrite the notice after selecting B', () => practiceLengthNotice(true));
test('Practice over200 A still shows its exact warning when A remains the current notice owner', async () => {
  await practiceLengthNotice(false); await practiceLengthNotice(false, renderer, 'ja');
});
test('inverse: missing Practice warning notice guard is killed by the actual A-to-B interleaving', async () => {
  const warning = "status.textContent = tx('練習したい語句を200文字以内で選ぶ。', 'Select a phrase of at most 200 characters to practice.'); return;";
  const mutant = mutation('if (ownsNotice(operation)) ' + warning, warning);
  await killed(() => practiceLengthNotice(true, mutant), /The late Practice warning must belong to the current selection/);
});

test('opaque source/commit errors never leak into either language of Open copy', async () => {
  const h = harness({ language: 'ja' }); h.select(); const held = h.pause('resolve'); h.open(); await held.entered.promise;
  assert.equal(h.status.textContent, '選んだ文章をひらいている。');
  held.error = Error('saved: internal source failure'); held.release.resolve(); await drain();
  assert.equal(h.status.textContent, '選んだ文章をひらけなかった。元の文章をひらき直し、選び直す。');
});

function mutation(before, after) {
  assert.equal(renderer.split(before).length - 1, 1, 'one intended production mutation site');
  return renderer.replace(before, after);
}
async function killed(run, message) {
  await assert.rejects(run, error => {
    assert.equal(error.code, 'ERR_ASSERTION', 'control must fail its assertion, not crash');
    assert.match(error.message, message); return true;
  });
}
test('inverse: restored cancellation of explicit Save on selection change is killed', async () => {
  const mutant = mutation("if (previous?.kind === 'open') {", 'if (previous) {');
  await killed(() => capturedSelection('save', mutant), /Changing selection must preserve explicit non-Open intent/);
});
test('inverse: tying control refresh to obsolete notice ownership leaves dead buttons and is killed', async () => {
  const mutant = mutation('if (currentSurface()) refresh();', 'if (ownsNotice(operation)) refresh();');
  await killed(() => sheetOwnership(true, mutant), /Silent revocation must release its controls/);
});
async function revokedWrite(code) {
  const h = harness({ code }); h.select(); const held = h.pause('resolve'); h.open(); await held.entered.promise;
  h.select(2, 3); held.release.resolve(); await drain();
  assert.equal(h.counts().writes, 0, 'Revoked operation must never reach storage');
}
test('inverse: omitted async/commit ownership checks are killed at the no-stale-write assertion', async () => {
  await revokedWrite(renderer);
  const mutant = mutation('const reason = ownerReason(operation, root);', 'const reason = null;');
  await killed(() => revokedWrite(mutant), /Revoked operation must never reach storage/);
});

async function lateNotice(code, detach) {
  const h = harness({ code }); h.select(); const held = h.pause('commit-after'); h.open(); await held.entered.promise;
  const status = h.status;
  if (detach) { h.find('context-open').remove(); status.remove(); }
  else h.context.teacherContextSelectionSerial++;
  status.textContent = 'Later notice owns this surface'; held.release.resolve(); await drain();
  assert.equal(status.textContent, 'Later notice owns this surface', 'Old completion must not overwrite this notice');
}
test('inverse: detached status publication is killed by the actual late-completion path', async () => {
  await lateNotice(renderer, true);
  const mutant = mutation('if (ownsNotice(operation)) status.textContent = openMessage(code);', 'status.textContent = openMessage(code);');
  await killed(() => lateNotice(mutant, true), /Old completion must not overwrite this notice/);
});
test('inverse: restored stale-Open Saved fallback is killed by its exact false-success assertion', async () => {
  await lateNotice(renderer, false);
  const mutant = mutation('      requireOwner(operation);\n      if (!kept)',
    `      if (operation.serial !== teacherContextSelectionSerial) { status.textContent = '${savedCopy}'; return false; }\n      requireOwner(operation);\n      if (!kept)`);
  await killed(() => lateNotice(mutant, false), /Old completion must not overwrite this notice/);
});
test('inverse: old finally clearing newer pending is killed, including the newer disabled controls', async () => {
  const mutant = mutation('if (state.pending === operation) { state.pending = null; if (currentSurface()) refresh(); }',
    'state.pending = null; if (currentSurface()) refresh();');
  await killed(() => supersession(mutant), /Old finally must preserve the newer pending owner/);
});

async function queuedNotice(code) {
  const h = harness({ code }); h.select(); const held = h.pause('commit-queued'); h.open(); await held.entered.promise;
  const next = clone(h.live); next.candidate.article.source.attribution = 'New owner'; h.queue(next);
  const status = h.status, text = status.textContent, refreshes = h.counts().refreshed; held.release.resolve(); await drain();
  assert.equal(status.textContent, text, 'Latched queued-source revocation must suppress publication through stale S');
  assert.equal(h.counts().refreshed, refreshes, 'Revoked source must not enable stale controls');
}
test('inverse: refreshing a revoked source through stale S is killed', async () => {
  await queuedNotice(renderer);
  const mutant = mutation('if (currentSurface()) refresh();', 'refresh();');
  await killed(() => queuedNotice(mutant), /Revoked source must not enable stale controls/);
});

async function foldControl(cancel = false, code = fold, detach = false) {
  const listeners = new Map(), timers = []; let closes = 0;
  const h = harness(); h.select(); const target = h.find('context-open'); target.closest = () => null;
  const on = (owner, type, fn) => { const key = `${owner}:${type}`, set = listeners.get(key) || new Set(); set.add(fn); listeners.set(key, set); };
  const emit = (owner, type, event = {}) => { for (const fn of listeners.get(`${owner}:${type}`) || []) fn(event); };
  const pop = { isConnected: true, contains: () => false, closest: () => null, classList: { contains: value => value === 'is-inline' } };
  runInNewContext(code, {
    window: { addEventListener: (t, f) => on('window', t, f), removeEventListener: (t, f) => listeners.get(`window:${t}`)?.delete(f) },
    document: { addEventListener: (t, f) => on('document', t, f), getElementById: id => id === 'vocabulary-list-popover' ? pop : null },
    setTimeout: fn => timers.push(fn), miniDiveOnAnchor: null, sealPending: null, sealStrip: null, ladderVisit: null,
    standingSlip: () => null, closeVocabularyListPopover: () => { closes++; pop.isConnected = false; },
    closeSealStrip: () => assert.fail('No seal'), clearWordLadder: () => assert.fail('No ladder'), removeMini: () => assert.fail('No mini'),
    clearReaderReadings: () => assert.fail('No reader background'),
  }, { timeout: 1000 });
  emit('document', 'pointerdown', { target, button: 0 }); target.emit('pointerdown');
  assert.equal(h.surface.state.pending, null, 'A press before click must not activate Open');
  assert.equal(closes, 0, 'Inline menu must not close on pointerdown'); assert.equal(timers.length, 0);
  emit('window', cancel ? 'pointercancel' : 'click'); assert.equal(closes, 0);
  if (detach) { pop.isConnected = false; target.remove(); }
  if (!cancel && target.isConnected) target.click();
  while (timers.length) timers.shift()(); assert.equal(closes, detach ? 0 : 1);
  await drain(); assert.equal(h.counts().navigation, cancel || detach ? 0 : 1);
}
test('unchanged deferred fold: real Open handler only after click; cancel/detach never activate; inverse controls', async () => {
  await foldControl(); await foldControl(true); await foldControl(false, fold, true); await foldControl(true, fold, true);
  const mutant = fold.replace("} else if (pop.classList.contains('is-inline')) foldMenuAfterPress(pop);", "} else if (pop.classList.contains('is-inline')) closeVocabularyListPopover();");
  assert.notEqual(mutant, fold); await killed(() => foldControl(false, mutant), /Inline menu must not close on pointerdown/);
  const early = fold.replace('const target = ev.target;', 'const target = ev.target; target.click();');
  assert.notEqual(early, fold); await killed(() => foldControl(false, early), /A press before click must not activate Open/);
});

test('new suite is registered exactly once without replacing a required suite', () => {
  const supplemental = readFileSync(new URL('../../../scripts/ci/supplemental.mjs', import.meta.url), 'utf8');
  assert.equal(supplemental.split("'prototypes/corridor/tools/publisher-context-open.test.mjs'").length - 1, 1);
  assert(supplemental.includes("'prototypes/corridor/tools/reader-english-rung.test.mjs'"));
});

// MOVER: actual declarations and DOM descendants, not a guessed body.textContent getter.
async function moverKilled(label, run, pattern) {
  let observed;
  await killed(async () => { try { await run(); } catch (error) {
    observed = { code: error.code, message: error.message.split('\n')[0] }; throw error;
  } }, pattern);
  console.log('MOVER_MUTANT ' + JSON.stringify({ label, outcome: 'killed-by-assertion', observed }));
}
const moverAst = ts.createSourceFile('corridor.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const moverNames = ['ladderVisit', 'ladderCleanupGeneration', 'inlineWordReading', 'inlineGlossLine', 'setGlossLine',
  'inlineWordGloss', 'seatGlossRow', 'activateWordLadder', 'ladderGlossRung', 'clearWordLadder', 'foldWordLadder', 'syncChromeKeep', 'back', 'installProseWordRoving', 'proseWordRovers'];
const moverDeclarations = new Map();
for (const statement of moverAst.statements) {
  const names = ts.isFunctionDeclaration(statement) ? [statement.name?.text]
    : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map(n => n.name.getText(moverAst)) : [];
  for (const name of names) if (moverNames.includes(name)) moverDeclarations.set(name, statement.getText(moverAst));
}
assert.equal(moverDeclarations.size, moverNames.length, 'Mover uses every actual ladder declaration');
const moverProgram = [...new Set(moverDeclarations.values())].join('\n');
function actualListener(needle) {
  const found = moverAst.statements.filter(n => ts.isExpressionStatement(n) && n.getText(moverAst).includes(needle));
  assert.equal(found.length, 1, needle); return found[0].getText(moverAst);
}
const ghostListener = actualListener('Date.now() < swallowClickUntil');
const escapeListener = actualListener("if (event.key !== 'Escape') return;");

function moverHarness({ personal = false, gloss = true, code = fold } = {}) {
  const h = harness({ personal }), { context: c, Node } = h;
  h.body.replaceChildren(new Node('#text', '', '町で'));
  const anchor = new Node('span', 'japanese-lookup-word'); anchor.append(new Node('#text', '', '雨'));
  h.body.append(anchor, new Node('#text', '', 'を見る。')); h.select(0, 3);
  const original = h.body.textContent, listeners = [], timers = [];
  let mini = null, focus = null, fitted = 0, closes = 0, entry = null;
  const register = (owner, type, fn, capture = false) => listeners.push({ owner, type, fn, capture: capture === true || !!capture?.capture });
  const unregister = (owner, type, fn) => { const i = listeners.findIndex(x => x.owner === owner && x.type === type && x.fn === fn); if (i >= 0) listeners.splice(i, 1); };
  const emit = (owner, type, event = {}, captureOnly = false) => {
    for (const row of [...listeners]) if (row.owner === owner && row.type === type && (!captureOnly || row.capture)) row.fn(event);
  };
  Object.assign(c.window, { addEventListener: (t, f, cap) => register('window', t, f, cap),
    removeEventListener: (t, f) => unregister('window', t, f) });
  Object.assign(c.document, { addEventListener: (t, f, cap) => register('document', t, f, cap),
    getElementById: id => h.nodes.findLast(n => n.isConnected && n.id === id) || null });
  Object.assign(c, { GESTURE: { MOVE_PX: 9 }, ladderPointers: new Set(), miniDiveOnAnchor: null, miniEntry: null,
    sealPending: null, sealStrip: null, miniAnchor: null, readingSlipSerial: 0, chromeKeepPressed: null,
    swallowClickUntil: 0, sheetTouchOrigin: null,
    standingSlip: () => mini, slipAllowed: () => !c.disallowSlip,
    closeSealStrip: () => { c.sealPending = null; c.sealStrip = null; },
    closeVocabularyListPopover: () => { closes++; c.document.getElementById('vocabulary-list-popover')?.remove(); },
    removeMini: () => { mini = null; }, clearReaderReadings: () => assert.fail('Source is not #reader'),
    kataToHira: x => x, dressStage() {}, setTouchReadingShown(rt, shown) { rt.classList.toggle('hidden-rt', !shown); },
    queueMicrotask() {}, syncWalkSentinel() {}, refreshLadderRoom() {},
    worldPickerEls: null, roomTransitionUpdating: true, returnFromNavigation: () => { c.returned = (c.returned || 0) + 1; return true; },
    japaneseLookupHelpId: () => 'lookup-help',
    setTimeout: fn => timers.push(fn), focusProseWord: node => { focus = node; },
    chromeKeep: () => { const button = new Node('button'); button.id = 'chrome-keep'; button.dataset.saveKey = 'new'; return button; },
    paintKeepAside() {}, fitChromeKeep: () => { fitted++; } });
  c.S.dials = { furigana: 1 }; c.S.navigationDepartures = 0; c.S.wordEntrySerial = 0;
  runInNewContext(moverProgram + '\n' + ghostListener + '\n' + escapeListener + '\n' + code + `
    this.mover = { get visit() { return ladderVisit; }, get generation() { return ladderCleanupGeneration; },
      get pending() { return sourceLadderPress; }, activate: activateWordLadder, gloss: ladderGlossRung,
      clear: clearWordLadder, fold: foldWordLadder, paint: setGlossLine,
      owner: sourceLadderOwner, current: sourceLadderOwnerCurrent, back, roving: installProseWordRoving };
  `, c, { timeout: 1000 });
  const m = c.mover;
  const options = { surface: '雨', reading: 'あめ', readingVisible: () => false,
    gloss: () => c.inlineWordGloss(anchor, 'rain'), openStage: () => 'stage' };
  assert.equal(m.activate(anchor, options), 'reading');
  assert.equal(h.body.textContent, '町で雨あめを見る。', 'Actual ruby/rt contributes descendant text');
  if (gloss) { assert.equal(m.activate(anchor, options), 'gloss'); assert.equal(h.body.textContent, '町で雨あめrainを見る。'); }
  const button = h.find('context-open'), label = new Node('span', 'bi-label', 'Open'); button.append(label);
  // Observed at the real target handler's entry, before its existing begin/currentSurface guard.
  const handler = [...button.listeners.get('click')][0]; button.listeners.set('click', new Set([event => {
    entry = { target: event.target, targetAlive: event.target.isConnected, buttonAlive: button.isConnected,
      text: h.body.textContent, pendingBefore: h.surface.state.pending }; return handler(event);
  }]));
  const event = (target, rest = {}) => ({ target, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true,
    clientX: 200, clientY: 300, detail: 1, defaultPrevented: false, propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, ...rest });
  const down = (target = label, rest = {}) => { const ev = event(target, rest); c.ladderPointers.add(ev.pointerId);
    emit('window', 'pointerdown', ev); emit('document', 'pointerdown', ev); return ev; };
  const up = (target = label, rest = {}) => { const ev = event(target, rest); c.ladderPointers.delete(ev.pointerId);
    emit('window', 'pointerup', ev); return ev; };
  const click = (target = label, rest = {}) => { const ev = event(target, rest);
    emit('window', 'click', ev); emit('document', 'click', ev);
    if (!ev.propagationStopped && target.isConnected) (target.closest('button') || target).emit('click', ev);
    return ev;
  };
  button.click = () => click(button, { detail: 0, pointerId: undefined, pointerType: undefined, isTrusted: false });
  anchor.click = () => click(anchor, { detail: 0, pointerId: undefined, pointerType: undefined, isTrusted: false });
  return { ...h, c, m, anchor, options, button, label, original, down, up, click, emit, event, listeners, timers,
    get live() { return h.live; }, set live(value) { h.live = value; },
    get entry() { return entry; }, get fitted() { return fitted; }, get focus() { return focus; }, get closes() { return closes; },
    set mini(value) { mini = value; } };
}

async function delivered({ personal = false, gloss = true, code = fold, mode = 'pointer' } = {}) {
  const h = moverHarness({ personal, gloss, code });
  const assisted = h.body.textContent, visit = h.m.visit;
  if (mode === 'pointer' || mode === 'compat' || mode === 'touch' || mode === 'pen') {
    const pointer = mode === 'touch' || mode === 'pen' ? { pointerType: mode } : {};
    h.down(h.label, pointer); assert.equal(h.body.textContent, assisted, 'Press must not remove assistance before click');
    assert.equal(h.counts().navigation, 0); assert.equal(h.surface.state.pending, null);
    // Ordinary focus transfer during mousedown reaches capturing blur listeners, not window blur.
    h.emit('window', 'blur', { target: h.anchor }, true);
    h.up(h.label, pointer); assert.equal(h.m.visit, visit, 'Pointerup never collapses assistance');
    h.click(h.label, mode === 'compat' ? { pointerId: undefined, pointerType: undefined } : pointer);
  } else {
    h.emit('window', 'keydown', { key: mode === 'space' ? ' ' : 'Enter', target: h.button });
    if (mode === 'AT/roving') h.button.click();
    else h.click(h.label, { detail: 0, pointerId: undefined, pointerType: undefined, isTrusted: false });
  }
  await drain();
  assert.equal(h.counts().navigation, 1, 'Actual source guard must admit Open once');
  assert.equal(h.counts().commits, 1); assert.equal(h.counts().writes, 1);
  assert.equal(h.entry.text, h.original); assert.equal(h.entry.target, mode === 'AT/roving' ? h.button : h.label);
  assert(h.entry.targetAlive && h.entry.buttonAlive, 'Already-targeted descendant and action survive cleanup');
  assert.deepEqual(h.created[0], { sourceKind: personal ? 'personal-reading' : 'publisher-reading', sourceId: personal ? 'personal-1' : 'publisher-1',
    sourceDigest: 'body-digest', unit: 'utf16-code-unit', start: 0, end: 3, quote: '町で雨', index: 0,
    title: 'Reading', attribution: 'The source author', url: `https://source.test/${personal ? 'personal' : 'publisher'}`, target: null });
  assert.deepEqual(Object.keys(h.patches[0]), ['teacherContexts']);
  return h;
}
for (const personal of [false, true]) for (const gloss of [false, true])
  test(`mover real guard: ${personal ? 'personal' : 'publisher'} ${gloss ? 'ruby + gloss' : 'ruby'} stays through press, clears before handler`, () => delivered({ personal, gloss }));
for (const mode of ['compat', 'touch', 'pen', 'enter', 'space', 'AT/roving'])
  test(`mover ${mode} uses exact current source and target`, () => delivered({ mode }));

test('mover counterexamples: parent sync and post-handler task each fail at the real fault', async () => {
  const parent = fold.replace('if (!action) clearWordLadder();', 'if (true) clearWordLadder();');
  assert.notEqual(parent, fold);
  await moverKilled('parent-synchronous-clear', () => delivered({ code: parent }), /Press must not remove assistance before click/);
  const late = fold.replace('  clearWordLadder(owner.visit);', '  setTimeout(() => clearWordLadder(owner.visit), 0);');
  assert.notEqual(late, fold);
  const h = moverHarness({ code: late }); h.down(); h.up(); h.click(); await drain();
  assert.equal(h.entry.text, '町で雨あめrainを見る。'); assert.equal(h.surface.state.lastOutcome.code, 'O7');
  assert.equal(h.counts().commits, 0, 'Actual begin/currentSurface refused contaminated body');
  while (h.timers.length) h.timers.shift()(); await drain();
  assert.equal(h.body.textContent, h.original); assert.equal(h.counts().navigation, 0, 'Late cleanup cannot resurrect missed action');
  await moverKilled('post-handler-task', () => delivered({ code: late }), /Actual source guard must admit Open once/);
});

const cancellations = {
  pointercancel: h => h.emit('window', 'pointercancel', h.event(h.label)),
  movement: h => h.emit('window', 'pointermove', h.event(h.label, { clientX: 210 })),
  scroll: h => h.emit('window', 'scroll', { target: h.body }),
  drag: h => h.emit('window', 'dragstart', h.event(h.label)),
  blur: h => h.emit('window', 'blur', { target: h.c.window }),
  visibility: h => h.emit('document', 'visibilitychange', {}),
  secondPointer: h => h.down(h.label, { pointerId: 2, isPrimary: false }),
  secondPointerElsewhere: h => h.down(h.root, { pointerId: 2, isPrimary: false }),
  mismatchedUp: h => h.up(h.label, { pointerId: 2 }),
  releaseMovement: h => h.up(h.label, { clientX: 211 }),
};
for (const [name, cancel] of Object.entries(cancellations)) test(`mover cancellation ${name} retires authorization, leaves assist`, async () => {
  const h = moverHarness(), visit = h.m.visit, text = h.body.textContent;
  h.down(); cancel(h); h.up(); h.click(); await drain();
  assert.equal(h.m.visit, visit); assert.equal(h.body.textContent, text);
  assert.equal(h.m.pending, null); assert.equal(h.counts().commits, 0);
});
for (const miss of ['no-release', 'wrong-id', 'wrong-type', 'ancestor', 'sibling', 'detached', 'suppressed', 'stale-sheet'])
  test(`mover click ${miss} cannot consume the cleanup`, async () => {
    const h = moverHarness(), visit = h.m.visit;
    const pointer = miss === 'stale-sheet' ? { pointerType: 'touch' } : {};
    h.down(h.label, pointer); if (miss !== 'no-release') h.up(h.label, pointer);
    let target = h.label, extra = {};
    if (miss === 'wrong-id') extra.pointerId = 9;
    if (miss === 'wrong-type') extra.pointerType = 'touch';
    if (miss === 'ancestor') target = h.button.closest('.publisher-context-selection');
    if (miss === 'sibling') target = h.find('sentence-practice');
    if (miss === 'detached') h.label.remove();
    if (miss === 'suppressed') h.c.swallowClickUntil = Date.now() + 10000;
    if (miss === 'stale-sheet') { h.c.sheetTouchOrigin = { sheet: { isConnected: false }, pointerId: 1 }; extra.pointerType = 'touch'; }
    h.click(target, extra); await drain(); assert.equal(h.m.visit, visit); assert.equal(h.counts().commits, 0);
    assert.equal(h.m.pending, null);
  });

const invalidations = {
  recordEpoch: h => h.c.recordEpoch++, pageEpoch: h => h.c.pageEpoch++,
  view: h => { h.c.S.view = 'search'; }, sourceId: h => { h.c.S.publisherReceipt = 'other'; },
  sourceRoot: h => { h.c.S.publisherLibrary = { entry: h.live }; },
  sourceValue: h => { h.live = { ...h.live, candidate: { article: { ...h.live.candidate.article, title: 'Changed' } } }; },
  stackPush: h => h.c.S.stack.push({ view: 'sheet' }), stackReplace: h => { h.c.S.stack = []; },
  stackFrame: h => { h.c.S.stack[0] = { view: 'changed' }; },
  detour: h => h.c.S.navigationDepartures++, wordEntry: h => h.c.S.wordEntrySerial++,
  selectionGeneration: h => h.surface.state.generation++,
  sourceRevoked: h => { h.surface.state.sourceRevoked = true; },
  recordOwner: h => { h.c.recordReady = () => false; },
  invalidLayer: h => { h.c.disallowSlip = true; },
  hiddenSurface: h => { h.button.closest('.publisher-context-selection').hidden = true; },
  inertSurface: h => { h.button.closest('.publisher-context-selection').inert = true; },
  detachedAnchor: h => h.anchor.remove(), detachedAction: h => h.button.remove(),
  replacedBody: h => { const body = new h.Node('article', '', h.original); body.id = 'publisher-body'; h.body.replaceWith(body); },
  surfaceReplacement: h => h.repaint(),
  miniArrival: h => { h.mini = new h.Node('aside'); },
  sameRungPaint: h => h.m.paint(h.anchor.querySelector('.tok-en'), 'new rain'),
  actualAdvance: h => h.m.activate(h.anchor, h.options),
  sameAnchorNewVisit: h => { h.m.clear(); h.m.activate(h.anchor, h.options); h.m.activate(h.anchor, h.options); },
  freshSuccessor: h => { const anchor = new h.Node('span', '', '雲'); h.body.append(anchor); h.m.activate(anchor, { ...h.options, surface: '雲' }); },
};
for (const [name, invalidate] of Object.entries(invalidations)) test(`mover owner invalidation ${name} preserves successor state`, async () => {
  const h = moverHarness(); if (name === 'stackFrame') h.c.S.stack.push({ view: 'first' });
  h.down(); invalidate(h); const visit = h.m.visit, text = h.body.textContent;
  h.up(); h.click(); await drain(); assert.equal(h.m.visit, visit); assert.equal(h.body.textContent, text);
  assert.equal(h.m.pending, null); assert.equal(h.counts().commits, 0);
});

async function aba(code = fold) {
  const h = moverHarness({ code }); const visit = h.m.visit; h.down();
  h.m.activate(h.anchor, h.options); assert.equal(visit.rung, 'stage');
  h.m.gloss(visit); const successor = h.anchor.querySelector('.tok-en');
  assert.equal(h.m.visit, visit); assert.equal(visit.rung, 'gloss');
  h.up(); h.click(); await drain();
  assert(successor.isConnected, 'Same-object/rung ABA must preserve new gloss');
  assert.equal(h.m.visit, visit); assert.equal(h.counts().commits, 0);
}
test('mover monotone generation defeats same-object ABA; identity/rung-only mutant is killed', async () => {
  await aba();
  const mutant = fold.replace(' || owner.generation !== ladderCleanupGeneration', ''); assert.notEqual(mutant, fold);
  await moverKilled('identity-rung-without-generation', () => aba(mutant), /Same-object\/rung ABA must preserve new gloss/);
});

test('mover no-click owner and listeners stay bounded; new intent cannot borrow old authorization', async () => {
  const h = moverHarness(), count = h.listeners.length, visit = h.m.visit;
  for (let i = 0; i < 100; i++) { h.down(); h.up(); assert(h.m.pending?.released); assert.equal(h.listeners.length, count); assert.equal(h.timers.length, 0); }
  h.down(h.find('sentence-practice')); h.up(); h.click(h.label); await drain();
  assert.equal(h.m.visit, visit); assert.equal(h.counts().commits, 0); assert.equal(h.m.pending, null);
  h.down(); h.up(); h.click(); await drain(); assert.equal(h.counts().writes, 1);
});

test('mover actual syncChromeKeep replacement preserves the actual Open target', async () => {
  const h = moverHarness(), old = new h.Node('button'); old.id = 'chrome-keep'; old.dataset.saveKey = 'old'; h.root.append(old);
  h.down(); h.up(); h.click(); await drain();
  assert.equal(old.isConnected, false); assert.equal(h.fitted, 1);
  assert(h.entry.targetAlive && h.entry.buttonAlive); assert.equal(h.entry.target, h.label); assert.equal(h.counts().writes, 1);
  const other = moverHarness(), chrome = new other.Node('button'); chrome.id = 'chrome-keep'; other.root.append(chrome);
  const visit = other.m.visit; other.click(chrome, { detail: 0 }); assert.equal(other.m.visit, visit, 'Chrome is outside new keyboard cleanup scope');
});

test('mover fresh keyboard rejects stale original source and a still-connected former section', async () => {
  const stale = moverHarness(); stale.live.candidate.article.title = 'new source';
  const visit = stale.m.visit; stale.click(stale.label, { detail: 0 }); await drain(); assert.equal(stale.m.visit, visit); assert.equal(stale.counts().writes, 0);
  const h = moverHarness(), old = h.button, oldVisit = h.m.visit;
  // Actual renderer replacement without detaching the old section; global current surface alone is insufficient.
  h.c.draw(h.root, clone(h.live), h.body, false);
  h.click(old, { detail: 0 }); await drain(); assert.equal(h.m.visit, oldVisit); assert.equal(h.counts().writes, 0);
});

test('mover exclusions and one-level Escape/Back remain the actual ladder grammar', () => {
  for (const id of ['seal-strip', 'vocabulary-list-popover']) {
    const h = moverHarness(), wrap = new h.Node('div'); wrap.id = id; h.root.append(wrap); wrap.append(h.button.closest('.publisher-context-selection'));
    const visit = h.m.visit; h.down(); h.up(); h.click(h.label, { detail: 0 }); assert.equal(h.m.visit, visit);
  }
  const anchor = moverHarness(), visit = anchor.m.visit; anchor.down(anchor.anchor); assert.equal(anchor.m.visit, visit);
  const back = moverHarness(), control = new back.Node('button'); control.id = 'back'; back.root.append(control);
  control.addEventListener('click', () => back.m.back());
  back.down(control); assert(back.m.visit); back.up(control); back.click(control);
  assert.equal(back.m.visit, null); assert.equal(back.c.returned, undefined, 'First Back only folds');
  back.down(control); back.up(control); back.click(control); assert.equal(back.c.returned, 1, 'Second Back returns');
  const escape = moverHarness(); escape.down(); escape.emit('window', 'keydown', { key: 'Escape' });
  const event = escape.event(escape.anchor, { key: 'Escape' }); escape.emit('document', 'keydown', event);
  assert.equal(escape.m.visit, null); assert.equal(escape.focus, escape.anchor); assert(event.defaultPrevented);
});

test('mover copy and existing source guard are unchanged; private generation owns page/restore seams', () => {
  assert(renderer.includes('body.textContent === source.text'));
  assert(renderer.includes("'選んだ文章をひらく', 'open selected text'"));
  assert(source.includes("ladderCleanupGeneration++;\n      ladderOpening.rung = 'page';"));
  assert(source.includes('ladderCleanupGeneration++;\n      ladderVisit = origin;'));
});

test('mover genuine roving Enter/Space calls word.click without outside cleanup or trust gate', () => {
  for (const key of ['Enter', ' ']) {
    const h = moverHarness({ gloss: false }), visit = h.m.visit;
    h.anchor.dataset.lookupText = '雨'; h.anchor.addEventListener('click', () => h.m.activate(h.anchor, h.options));
    h.m.roving(h.body); const event = h.event(h.body, { key, detail: 0 });
    h.emit('window', 'keydown', event); h.body.emit('keydown', event);
    assert(event.defaultPrevented); assert.equal(h.m.visit, visit); assert.equal(visit.rung, 'gloss');
    assert.equal(h.body.textContent, '町で雨あめrainを見る。'); assert.equal(h.counts().commits, 0);
  }
});

test('mover first-use demo and all navigation Back selectors retain parent outside semantics', () => {
  for (const id of ['sheet-back', 'chrome-back', 'back', 'action-back', 'bar-back']) {
    const h = moverHarness(), button = new h.Node('button'); button.id = id;
    if (id === 'action-back') button.dataset.action = 'navigation.back';
    if (id === 'bar-back') button.dataset.barBack = '';
    h.root.append(button); const visit = h.m.visit; h.down(button); assert.equal(h.m.visit, visit);
  }
  const h = moverHarness(), button = new h.Node('button'); button.id = 'back'; h.root.append(button);
  h.m.visit.demo = true; button.addEventListener('click', () => h.m.back());
  h.down(button); assert.equal(h.m.visit, null, 'Demo clears on press as before');
  h.up(button); h.click(button); assert.equal(h.c.returned, 1, 'Demo Back leaves on that click');
});

for (const kind of ['save', 'practice', 'lookup']) test(`mover ${kind} restores exact source before existing action; no extra debt`, async () => {
  const h = moverHarness({ personal: kind === 'lookup' });
  const button = h.find(kind === 'save' ? 'context-save' : kind === 'practice' ? 'sentence-practice' : 'selection-lookup');
  // saveOne's keep callback is the existing renderer's real persistence boundary (saveOne itself is tested by Japanese suite).
  if (kind === 'save') button.addEventListener('click', () => { void button.options.keep(); });
  h.down(button); h.up(button); h.click(button); await drain();
  assert.equal(h.created[0].quote, '町で雨'); assert.equal(h.created[0].start, 0); assert.equal(h.created[0].end, 3);
  assert.equal(h.counts().writes, kind === 'save' ? 1 : 0); assert.equal(h.counts().navigation, kind === 'save' ? 0 : 1);
  if (kind === 'save') { assert.equal(h.status.textContent, savedCopy); assert.deepEqual(Object.keys(h.patches[0]), ['teacherContexts']); }
});

test('mover defaultPrevented mutant cannot hide behind pointer-type mismatch', async () => {
  async function suppressed(code) {
    const h = moverHarness({ code }), visit = h.m.visit;
    h.down(h.label, { pointerType: 'touch' }); h.up(h.label, { pointerType: 'touch' });
    h.c.sheetTouchOrigin = { sheet: { isConnected: false }, pointerId: 1 };
    h.click(h.label, { pointerType: 'touch' });
    assert.equal(h.m.visit, visit, 'Suppressed same-pointer click must preserve assist');
  }
  await suppressed(fold);
  const mutant = fold.replace('  if (event.defaultPrevented) return;', ''); assert.notEqual(mutant, fold);
  await moverKilled('ignore-ghost-suppression', () => suppressed(mutant), /Suppressed same-pointer click must preserve assist/);
});
