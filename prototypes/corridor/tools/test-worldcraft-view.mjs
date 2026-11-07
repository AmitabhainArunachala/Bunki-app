/** Source-only DOM/event controls. No browser, layout, network, learner host,
 * build, persistence or admission claim. Geometry fixtures use the bundled pure
 * structure model; this does not replace authenticated host source admission.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import structure from '../kanji-structure.js';
import { createWorldcraftView } from '../worldcraft-view.mjs';

const json = file => JSON.parse(readFileSync(new URL(`../data/share_alike/${file}.json`, import.meta.url), 'utf8'));
const model = structure.createModel({ kanji: json('kanji').kanji, strokes: json('strokes').strokes, grouping: json('kanji-structure') });
const left = { 職: '耳', 識: '言', 織: '糸' };
function fixture(host = '職', extra = {}) {
  const occurrences = model.inspect(host).occurrences;
  return { host, phase: 'new', busy: false, uncertain: false, message: null, kept: [],
    parts: [left[host], '戠'].map((label, i) => ({ label,
      paths: model.project(host, occurrences.find(row => row.groupPath === `$/0/${i}`).id).paths })),
    assembledPaths: null, ...extra };
}
function whole(host = '職') {
  return model.project(host, model.inspect(host).occurrences.find(row => row.groupPath === '$/0').id).paths;
}
const row = (id = 'root/projects/1', host = '職', extra = {}) => ({ id, host, paths: whole(host), actionable: true, ...extra });
const descendants = node => [node, ...node.children.flatMap(descendants)];
class Element {
  constructor(document, tag) {
    this.ownerDocument = document; this.tagName = tag.toUpperCase(); this.children = [];
    this.parentNode = null; this.dataset = {}; this.attributes = {}; this.events = new Map(); this.text = '';
    this.disabled = false; this.className = ''; this.id = '';
  }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  replaceChildren(...nodes) { for (const node of this.children) node.parentNode = null; this.children = []; this.text = ''; this.append(...nodes); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(type, callback) { this.events.set(type, [...(this.events.get(type) || []), callback]); }
  emit(type, extra = {}) { for (const callback of this.events.get(type) || []) callback({ target: this, preventDefault() {}, ...extra }); }
  click() { if (!this.disabled) this.emit('click'); }
  focus() { if (!this.disabled && this.isConnected) this.ownerDocument.activeElement = this; }
  contains(node) { return descendants(this).includes(node); }
  get isConnected() { return this === this.ownerDocument.body || !!this.parentNode?.isConnected; }
  get textContent() { return this.text + this.children.map(node => node.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this.text = String(value); }
}
function setup(dto = fixture(), { language = 'en', overrides = {} } = {}) {
  const document = { activeElement: null, createElement(tag) { return new Element(this, tag); },
    createElementNS(namespace, tag) { assert.equal(namespace, 'http://www.w3.org/2000/svg'); return this.createElement(tag); } };
  document.body = document.createElement('body');
  const biLabel = (tag, cls, ja, en) => {
    const node = document.createElement(tag), span = document.createElement('span');
    node.className = cls; span.className = 'l-ja'; span.textContent = language === 'ja' ? ja : en; node.append(span); return node;
  };
  const calls = [];
  const actions = Object.fromEntries(['assemble', 'keep', 'inspect', 'requestRemove', 'confirmRemove', 'cancelRemove', 'leave']
    .map(name => [name, (...args) => { calls.push([name, ...args]); return overrides[name]?.(...args); }]));
  const view = createWorldcraftView({ document, biLabel }); document.body.append(view.element); view.render(dto, actions);
  const nodes = () => descendants(view.element);
  return { view, document, calls, actions, nodes,
    render(next, callbacks = actions) { view.render(next, callbacks); },
    button(action, id) { return nodes().find(node => node.tagName === 'BUTTON' && node.dataset.worldcraftAction === action && (id === undefined || node.dataset.worldcraftId === id)); },
    copy(code) { return nodes().filter(node => node.dataset.worldcraftCopy === code); },
    get text() { return view.element.textContent; },
    get paths() { return nodes().filter(node => node.tagName === 'PATH').map(node => node.getAttribute('d')); },
  };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test('new builders show exactly their own bundled component paths, without assembled result or reading/keyword disclosure', () => {
  for (const host of Object.keys(left)) {
    const dto = fixture(host, { assembledPaths: whole(host), reading: 'ショク', keyword: 'occupation' });
    const h = setup(dto);
    assert.deepEqual(h.paths, dto.parts.flatMap(part => part.paths));
    assert.equal(h.copy('W-05').length, 0); assert.equal(h.copy('W-06').length, 0);
    assert.doesNotMatch(h.text, /Built:|ショク|occupation/);
    assert.match(h.button('assemble').textContent, new RegExp(`Put the parts together: ${left[host]} and 戠`));
    assert.equal(h.button('keep').disabled, true);
  }
});

test('only explicit assembled DTO discloses the whole result and honest note; promise value cannot disclose it', async () => {
  const job = deferred(), h = setup(fixture(), { overrides: { assemble: () => job.promise } });
  h.button('assemble').click(); job.resolve({ phase: 'assembled', assembledPaths: whole() }); await flush();
  assert.equal(h.copy('W-05').length, 0); assert.equal(h.button('assemble').disabled, true);
  h.render(fixture('職', { phase: 'assembled', assembledPaths: whole() }));
  assert.equal(h.copy('W-05').length, 1); assert.equal(h.copy('W-06').length, 1);
  assert.match(h.copy('W-06')[0].textContent, /Building isn’t a test, and it never records a review\./);
  assert.equal(h.button('keep').disabled, false);
});

test('missing result paths, busy, assembling, saved, and uncertainty cannot dispatch Keep', () => {
  for (const extra of [{}, { phase: 'assembled' }, { phase: 'assembling', assembledPaths: whole() },
    { phase: 'assembled', assembledPaths: whole(), busy: true }, { phase: 'assembled', assembledPaths: whole(), uncertain: true },
    { phase: 'saved', assembledPaths: whole() }]) {
    const h = setup(fixture('職', extra)); h.button('keep').click(); h.button('keep').emit('click');
    assert.equal(h.button('keep').disabled, true); assert.deepEqual(h.calls, []);
  }
});

test('duplicate presses, including a rerender while pending, issue one Assemble command', async () => {
  const job = deferred(), h = setup(fixture(), { overrides: { assemble: () => job.promise } });
  const old = h.button('assemble'); old.click(); old.emit('click');
  h.render(fixture()); h.button('assemble').emit('click');
  assert.deepEqual(h.calls, [['assemble']]);
  job.resolve(); await flush();
  h.render(fixture('職', { phase: 'assembled', assembledPaths: whole() }));
  assert.equal(h.button('keep').disabled, false);
});

test('Keep is one-shot until its promise settles and a new authoritative render; neither promise branch reports success', async () => {
  for (const reject of [false, true]) {
    const job = deferred(), dto = fixture('職', { phase: 'assembled', assembledPaths: whole() });
    const h = setup(dto, { overrides: { keep: () => job.promise } });
    h.button('keep').click(); h.button('keep').emit('click');
    if (reject) job.reject(new Error('unknown durability')); else job.resolve({ saved: true });
    await flush(); h.button('keep').emit('click');
    assert.deepEqual(h.calls, [['keep']]); assert.equal(h.copy('W-09').length, 0);
    h.render({ ...dto, uncertain: true, message: { code: 'W-11' } });
    assert.equal(h.button('keep').disabled, true); assert.equal(h.copy('W-11').length, 1);
    assert.equal(h.copy('W-05').length, 1);
  }
});

test('host-confirmed saved and removed copy is displayed only when supplied, never inferred from phase/list', () => {
  const h = setup(fixture('職', { phase: 'saved', assembledPaths: whole(), kept: [row()] }));
  assert.equal(h.copy('W-09').length, 0);
  h.render(fixture('職', { phase: 'saved', assembledPaths: whole(), kept: [row()], message: { code: 'W-09' } }));
  assert.equal(h.copy('W-09').length, 1);
  h.render(fixture()); assert.equal(h.copy('W-15').length, 0);
  h.render(fixture('職', { message: { code: 'W-15' } })); assert.equal(h.copy('W-15').length, 1);
});

test('old DOM and late async completion cannot repaint or invoke a replacement binding', async () => {
  const job = deferred(), h = setup(fixture(), { overrides: { assemble: () => job.promise } });
  const old = h.button('assemble'); old.click();
  const replacement = [];
  h.render(fixture('織'), Object.fromEntries(Object.keys(h.actions).map(name => [name, () => replacement.push(name)])));
  old.emit('click'); job.resolve({ host: '職', assembledPaths: whole() }); await flush();
  assert.deepEqual(replacement, []); assert.equal(h.copy('W-05').length, 0);
  assert.deepEqual(h.paths, fixture('織').parts.flatMap(part => part.paths));
  assert.match(h.button('assemble').textContent, /糸 and 戠/);
});

test('destruction and disconnection revoke old handlers; rejected callbacks never create unhandled success UI', async () => {
  const job = deferred(), h = setup(fixture(), { overrides: { assemble: () => job.promise } });
  const button = h.button('assemble'); button.click(); h.view.destroy(); button.emit('click'); job.reject(new Error('lost')); await flush();
  assert.deepEqual(h.calls, [['assemble']]); assert.equal(h.text, '');
  assert.throws(() => h.render(fixture()), /destroyed/);
  const detached = setup(); detached.document.body.replaceChildren(); detached.button('assemble').emit('click');
  assert.deepEqual(detached.calls, []);
});

test('Remove requires explicit exact-id confirmation; cancel and Escape preserve the row', () => {
  const h = setup(fixture('職', { kept: [row(), row('root/projects/2', '織')] }));
  h.button('request-remove', 'root/projects/2').click();
  assert.deepEqual(h.calls, [['requestRemove', 'root/projects/2']]);
  assert.equal(h.copy('W-14').length, 1); assert.equal(h.document.activeElement, h.button('cancel-remove', 'root/projects/2'));
  const cancel = h.button('cancel-remove', 'root/projects/2'); cancel.click();
  assert.equal(h.copy('W-14').length, 0); assert.equal(h.button('confirm-remove'), undefined);
  assert.equal(h.document.activeElement, h.button('request-remove', 'root/projects/2'));
  h.button('request-remove', 'root/projects/1').click();
  h.button('cancel-remove').parentNode.emit('keydown', { key: 'Escape' });
  assert.equal(h.calls.filter(call => call[0] === 'confirmRemove').length, 0);
  assert.equal(h.calls.filter(call => call[0] === 'cancelRemove').length, 2);
  assert.equal(h.nodes().filter(node => node.tagName === 'LI').length, 2);
});

test('confirmed Remove is latched and list/copy wait for the host, including unknown outcome', async () => {
  const job = deferred(), dto = fixture('職', { kept: [row()] });
  const h = setup(dto, { overrides: { confirmRemove: () => job.promise } });
  h.button('request-remove').click(); const confirm = h.button('confirm-remove'); confirm.click(); confirm.emit('click');
  assert.deepEqual(h.calls, [['requestRemove', 'root/projects/1'], ['confirmRemove', 'root/projects/1']]);
  assert.equal(h.nodes().filter(node => node.tagName === 'LI').length, 1); assert.equal(h.copy('W-15').length, 0);
  job.resolve(); await flush();
  h.render({ ...dto, uncertain: true, message: { code: 'W-11' } });
  assert.equal(h.button('request-remove').disabled, true); assert.equal(h.copy('W-14').length, 0);
  confirm.emit('click'); assert.equal(h.calls.filter(call => call[0] === 'confirmRemove').length, 1);
});

test('confirmation is dismissed by host rerender and cannot be carried to another owner binding', () => {
  const dto = fixture('職', { kept: [row()] }), h = setup(dto);
  h.button('request-remove').click(); const oldConfirm = h.button('confirm-remove');
  h.render(dto); oldConfirm.emit('click');
  assert.equal(h.copy('W-14').length, 0); assert.equal(h.calls.filter(call => call[0] === 'confirmRemove').length, 0);
});

test('unknown and nonactionable saved rows cannot inspect/remove, and busy/uncertain blocks all row mutations', () => {
  for (const extra of [{ kept: [row('x', '職', { actionable: false })] }, { kept: [row('x', '職', { paths: null })] },
    { kept: [{ id: 'x', host: '?', paths: null, actionable: true }] }, { kept: [row()], busy: true }, { kept: [row()], uncertain: true }]) {
    const h = setup(fixture('職', extra));
    h.button('inspect').emit('click'); h.button('request-remove').emit('click');
    assert.deepEqual(h.calls, []); assert.equal(h.copy('W-14').length, 0);
  }
});

test('Leave on a known unkept result requires explicit Keep or Leave, with no automatic exit after Keep', async () => {
  const dto = fixture('職', { phase: 'assembled', assembledPaths: whole() }), h = setup(dto);
  h.button('leave').click(); assert.equal(h.copy('W-17').length, 1); assert.deepEqual(h.calls, []);
  assert.equal(h.document.activeElement, h.button('keep-before-leave'));
  h.button('keep-before-leave').click(); await flush();
  assert.deepEqual(h.calls, [['keep']]);
  h.render({ ...dto, phase: 'saved', message: { code: 'W-09' } });
  h.button('leave').click(); h.button('leave').emit('click');
  assert.deepEqual(h.calls, [['keep'], ['leave']]);
  const explicit = setup(dto); explicit.button('leave').click(); explicit.button('confirm-leave').click();
  assert.deepEqual(explicit.calls, [['leave']]);
});

test('uncertainty does not claim an unkept build, and leaving stays available while actions are busy', () => {
  for (const flags of [{ uncertain: true }, { busy: true }]) {
    const h = setup(fixture('職', { phase: 'assembled', assembledPaths: whole(), ...flags }));
    h.button('leave').click(); assert.equal(h.copy('W-17').length, 0); assert.deepEqual(h.calls, [['leave']]);
  }
});

test('native buttons retain semantic keyboard/touch activation and static diagrams require no motion API', () => {
  const h = setup(fixture());
  for (const button of h.nodes().filter(node => node.tagName === 'BUTTON')) {
    assert.equal(button.type, 'button'); assert.ok(button.textContent.length); assert.deepEqual([...button.events.keys()], ['click']);
  }
  for (const svg of h.nodes().filter(node => node.tagName === 'SVG')) {
    assert.equal(svg.getAttribute('viewBox'), '0 0 109 109'); assert.equal(svg.getAttribute('aria-hidden'), 'true');
    assert.equal(svg.getAttribute('focusable'), 'false');
  }
  assert.equal(h.nodes().some(node => ['ANIMATE', 'ANIMATETRANSFORM'].includes(node.tagName)), false);
});

test('Japanese uses one visible label; host outcome codes map to the approved exact lines', () => {
  const h = setup(fixture('識'), { language: 'ja' });
  assert.equal(h.button('assemble').textContent, '部品を組み合わせる：言と戠');
  assert.doesNotMatch(h.text, /Build a character|Keep this build/);
  for (const code of ['W-09', 'W-10', 'W-11', 'W-12', 'W-15', 'W-16', 'W-18', 'W-19', 'W-20', 'W-21']) {
    h.render(fixture('識', { message: { code } }));
    assert.ok(h.copy(code).length >= 1); assert.ok(h.copy(code)[0].textContent.length > 0);
  }
});

test('invalid display replacements revoke old actions, and unsupported hosts disclose no supplied geometry', () => {
  const h = setup(), old = h.button('assemble');
  assert.throws(() => h.render(fixture('職', { parts: fixture('織').parts })), /own-host/);
  old.emit('click'); assert.deepEqual(h.calls, []); assert.equal(h.text, '');
  const unsupported = setup({ ...fixture(), host: '木', assembledPaths: whole(), phase: 'assembled' });
  assert.equal(unsupported.copy('W-16').length, 1); assert.deepEqual(unsupported.paths, []);
  assert.equal(unsupported.button('assemble'), undefined); assert.equal(unsupported.button('keep'), undefined);
});

test('DOM uses text nodes for labels and copies admitted arrays before later caller mutation', () => {
  const dto = fixture(), h = setup(dto), before = h.paths.slice();
  dto.parts[0].paths = ['M0 0L1 1']; dto.host = '織';
  assert.deepEqual(h.paths, before);
  const hostile = setup(fixture('職', { kept: [{ id: 'x', host: '<img src=x onerror=attack()>', paths: null, actionable: false }] }));
  assert.ok(hostile.text.includes('<img src=x onerror=attack()>'));
  assert.equal(hostile.nodes().some(node => node.tagName === 'IMG'), false);
});


test('detached confirmation Escape cannot cancel or repaint a later render; focus follows the same exact row', () => {
  const dto = fixture('職', { kept: [row(), row('root/projects/2', '織')] }), h = setup(dto);
  h.button('request-remove', 'root/projects/2').click();
  const oldGroup = h.button('cancel-remove').parentNode;
  h.render(dto); const before = h.text; oldGroup.emit('keydown', { key: 'Escape' });
  assert.equal(h.text, before); assert.deepEqual(h.calls, [['requestRemove', 'root/projects/2']]);
  const selected = h.button('inspect', 'root/projects/2'); selected.focus(); h.render(dto);
  assert.equal(h.document.activeElement, h.button('inspect', 'root/projects/2'));
  h.view.destroy(); oldGroup.emit('keydown', { key: 'Escape' });
  assert.equal(h.text, ''); assert.deepEqual(h.calls, [['requestRemove', 'root/projects/2']]);
});

test('synchronous host render during an action releases only its settled latch and never restores old disclosure', async () => {
  let h;
  h = setup(fixture(), { overrides: { assemble: () => {
    h.render(fixture('職', { phase: 'assembled', assembledPaths: whole() }));
  } } });
  h.button('assemble').click(); await flush();
  assert.equal(h.button('keep').disabled, false); assert.equal(h.copy('W-05').length, 1);
  const noResult = setup(fixture(), { overrides: { assemble: () => { throw new Error('refused'); } } });
  noResult.button('assemble').click(); noResult.button('assemble').emit('click');
  assert.deepEqual(noResult.calls, [['assemble']]); assert.equal(noResult.copy('W-05').length, 0);
  noResult.render(fixture()); assert.equal(noResult.button('assemble').disabled, false);
});


for (const keepAction of ['keep', 'keep-before-leave']) {
  test(`${keepAction} dismisses the unkept prompt before dispatch, while pending Leave stays available exactly once`, async () => {
    const job = deferred();
    let h, promptAtDispatch;
    h = setup(fixture('職', { phase: 'assembled', assembledPaths: whole() }), {
      overrides: { keep: () => { promptAtDispatch = h.copy('W-17').length; return job.promise; } },
    });
    h.button('leave').click();
    assert.equal(h.copy('W-17').length, 1);
    const oldMainKeep = h.button('keep'), oldPromptKeep = h.button('keep-before-leave');
    h.button(keepAction).click();
    assert.equal(promptAtDispatch, 0, 'Nonpublication copy must disappear before the host write begins');
    assert.equal(h.copy('W-17').length, 0);
    assert.equal(h.button('keep-before-leave'), undefined);
    assert.equal(h.view.element.getAttribute('aria-busy'), 'true');
    assert.equal(h.button('keep').disabled, true);
    oldMainKeep.emit('click'); oldPromptKeep.emit('click'); h.button('keep').emit('click');
    assert.deepEqual(h.calls, [['keep']]);
    assert.equal(h.button('leave').disabled, false);
    h.button('leave').click(); h.button('leave').emit('click');
    assert.deepEqual(h.calls, [['keep'], ['leave']]);
    assert.equal(h.copy('W-17').length, 0);
    assert.equal(h.copy('W-09').length, 0);
    job.reject(new Error('publication unresolved')); await flush();
    assert.equal(h.copy('W-17').length, 0); assert.equal(h.copy('W-09').length, 0);
    assert.equal(h.button('keep').disabled, true);
    assert.deepEqual(h.calls, [['keep'], ['leave']]);
  });
}
