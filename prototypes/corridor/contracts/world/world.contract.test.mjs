/** G7 judge: one model doc and stubs — a world is a view over the shared graph with one state layer for projects,
 * continuation and journeys (campaign/contracts/G7.json; SPEC S6-R8, S7-R2, S7-R3, S7-R15). Pinned by the contract; the
 * worker writes docs/worlds/WORLD-MODEL.md, world.mjs and stubs/{worldcraft,passage,quest}.mjs and may not edit this
 * file. The shared graph here is the shipped data itself (dict-v2 through G13, KanjiVG parts through G5); expected kanji
 * and parts are computed from that data, never typed. The base's three models are imported and shown to keep different
 * state. Authored by the Bunki lead 2026-11-06; TESTS_SOUND by a second family before pinning. */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { entryId } from '../identity/identity.mjs';
import { validateReturnRecord, PURPOSES } from '../return/return.mjs';
import { createQuestState } from '../../m4-quest.mjs';
import { createWorldcraftState, createWorldOwner } from '../../m4-worldcraft.mjs';
import { createPassage } from '../../m4-passage.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..', '..');
const ROOT = resolve(CORRIDOR, '..', '..');
const DATA = join(CORRIDOR, 'data');
const MODULE = join(HERE, 'world.mjs'), DOC = join(ROOT, 'docs', 'worlds', 'WORLD-MODEL.md');
const STUBS = ['worldcraft', 'passage', 'quest'].map((k) => [k, join(HERE, 'stubs', `${k}.mjs`)]);
const ALLOWED_IMPORTS = new Set(['../word-entry/entry.mjs', '../parts/parts.mjs', '../return/return.mjs', '../identity/identity.mjs']);
const STUB_IMPORTS = new Set(['../world.mjs']);
const BANNED = ['indexedDB', 'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest', 'setTimeout', 'setInterval', 'queueMicrotask', 'Date', 'performance', 'window', 'self', 'document', 'navigator', 'globalThis', 'process', 'require', 'crypto'];
const REPLACED = ['M3', 'm4-worldcraft.mjs', 'worldcraft-view.mjs', 'm4-passage.mjs', 'm4-quest.mjs', 'kanji-world-encounter.mjs'];
const STATE_KEYS = ['continuation', 'journeys', 'projects', 'version'];
const HAN = /\p{Script=Han}/u, CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu;
const at = 1762300800000;

// ---- the shipped data, loaded once; expectations computed from it --------------------------------------------------
const dictionary = { core: JSON.parse(readFileSync(join(DATA, 'share_alike', 'dict.json'), 'utf8')), index: JSON.parse(readFileSync(join(DATA, 'share_alike', 'dict-v2', 'index.json'), 'utf8')), shards: {} };
const parts = { graph: JSON.parse(readFileSync(join(DATA, 'parts-graph', 'graph.json'), 'utf8')), unmapped: JSON.parse(readFileSync(join(DATA, 'parts-graph', 'unmapped.json'), 'utf8')) };
const partByLiteral = new Map(parts.graph.parts.map((p) => [p.literal, p]));
const componentsOf = (id) => parts.graph.relations.filter((r) => r.kind === 'component' && r.from === id).map((r) => r.to);
const familyOf = (id) => parts.graph.relations.filter((r) => r.kind === 'component' && r.to === id).map((r) => r.from);
const I = { seq: 0, head: 1, primaryReading: 2, writtenForms: 4, kanaForms: 5 };
const rowOf = (head) => dictionary.index.entries.find((e) => e[I.head] === head);
const idOf = (row) => entryId({ seq: row[I.seq], spelling: row[I.head], reading: row[I.primaryReading] });
const W = idOf(rowOf('食べる'));                                   // a word whose kanji is a leaf used in a family of kanji
/** a data-chosen single-kanji head whose kanji has components in the parts graph */
const composedRow = dictionary.index.entries.find((e) => [...e[I.head]].length === 1 && HAN.test(e[I.head]) && partByLiteral.has(e[I.head]) && componentsOf(partByLiteral.get(e[I.head]).id).length >= 2);
const C = idOf(composedRow);
const dictionaryWords = new Set(dictionary.index.entries.flatMap((e) => [e[I.head], ...(e[I.writtenForms] || []), ...(e[I.kanaForms] || [])]));

const calls = { store: 0, fetch: 0 };
globalThis.localStorage = { getItem() { calls.store += 1; return null; }, setItem() { calls.store += 1; }, removeItem() { calls.store += 1; } };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.indexedDB = { open() { calls.store += 1; throw new Error('no store'); } };
globalThis.fetch = () => { calls.fetch += 1; return Promise.reject(new Error('no network')); };

/** the one stub suite: open a world by entry id, read the shared graph, save a project through the single state layer */
function suite(model, graph) {
  const world = model.open(graph, W);
  assert.equal(world.kind, model.kind); assert.equal(world.root, W, 'opened on the entry id');
  assert.equal(world.view.entry.entry, W, 'the view holds the G13 entry object'); assert.ok(world.view.entry.firstAnswer.text, 'with its first answer from the dictionary');
  const expected = [...'食べる'].filter((ch) => HAN.test(ch)).map((literal) => ({ literal, partId: partByLiteral.get(literal).id, parts: componentsOf(partByLiteral.get(literal).id), family: familyOf(partByLiteral.get(literal).id) }));
  assert.deepEqual(world.view.kanji.map(({ literal, partId, parts: p, family }) => ({ literal, partId, parts: p, family })), expected, 'the kanji, their G5 part ids, components and family are the graph\'s');
  assert.ok(world.view.family.length >= 5, 'the family of 食 is read from the parts graph');
  let s = model.state();
  assert.deepEqual(Object.keys(s).sort(), STATE_KEYS, 'one state layer: {projects, continuation, journeys}');
  s = model.save(s, world, { projectId: 'p1', placed: world.view.family.slice(0, 2), at });
  s = model.pause(s, world, { position: { stop: 2, hop: 'north' }, at: at + 1 });
  s = model.journey(s, world, { journeyId: 'j1', at: at + 2 });
  assert.deepEqual(s.projects, [{ worldId: world.id, projectId: 'p1', placed: world.view.family.slice(0, 2), savedAt: at }]);
  assert.deepEqual(s.continuation, { worldId: world.id, position: { stop: 2, hop: 'north' }, at: at + 1 });
  assert.deepEqual(s.journeys, [{ worldId: world.id, journeyId: 'j1', step: 0, startedAt: at + 2, status: 'open' }]);
  assert.ok(Object.isFrozen(world) && Object.isFrozen(s));
  return { world, state: s };
}
const scanBanned = (file, allowed) => {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) { assert.ok(allowed.has(stmt.moduleSpecifier.text), `${file}: import ${stmt.moduleSpecifier.text} is allowed`); continue; }
    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) assert.ok(allowed.has(stmt.moduleSpecifier.text));
    assert.ok(ts.isExportDeclaration(stmt) || ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || (ts.isVariableStatement(stmt) && (stmt.declarationList.flags & ts.NodeFlags.Const)), `${file}: declaration, not action: ${stmt.getText(sf).slice(0, 50)}`);
  }
  const seen = new Set();
  const bare = (node) => !((ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) || (ts.isPropertyAssignment(node.parent) && node.parent.name === node));
  const visit = (node) => { if (ts.isIdentifier(node) && BANNED.includes(node.text) && bare(node)) seen.add(node.text); if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) seen.add('import()'); ts.forEachChild(node, visit); };
  visit(sf); assert.deepEqual([...seen], [], `${file}: no store, network, clock, timer or random`);
};

test('world contract · G7', async (t) => {
  let m, graph, stubs;
  await t.test('the doc, the module and the three stubs exist; the shared graph opens on the shipped data', async () => {
    assert.ok(existsSync(DOC), 'docs/worlds/WORLD-MODEL.md exists'); assert.ok(existsSync(MODULE), 'world.mjs exists');
    m = await import(pathToFileURL(MODULE));
    for (const name of ['createSharedGraph', 'openWorld', 'createWorldState', 'saveProject', 'continueAt', 'startJourney', 'advanceJourney', 'enterWorld']) assert.equal(typeof m[name], 'function', `exports ${name}`);
    graph = m.createSharedGraph({ dictionary, parts });
    stubs = Object.fromEntries(await Promise.all(STUBS.map(async ([k, f]) => { assert.ok(existsSync(f), `${f} exists`); return [k, await import(pathToFileURL(f))]; })));
    for (const [k, s] of Object.entries(stubs)) { assert.equal(s.kind, k); for (const fn of ['open', 'state', 'save', 'pause', 'journey']) assert.equal(typeof s[fn], 'function', `${k} stub: ${fn}`); }
  });

  await t.test('[0] WORLD-MODEL.md defines a world as a view over the shared graph plus one state layer, and names the models it replaces', () => {
    const doc = readFileSync(DOC, 'utf8');
    assert.match(doc, /view over the shared graph/iu); assert.match(doc, /state layer/iu);
    for (const word of ['projects', 'continuation', 'journeys', 'G9', 'G5', 'part id']) assert.ok(new RegExp(word, 'iu').test(doc), `the doc speaks of ${word}`);
    for (const name of REPLACED) assert.ok(doc.includes(name), `the doc names ${name}`);
    assert.match(doc, /design[- ]only/iu, 'M3 is named as design only');
    assert.ok(/Worldcraft/u.test(doc) && /Passage/u.test(doc) && /quest/iu.test(doc) && /kanji world/iu.test(doc));
  });

  await t.test('[1] Worldcraft, Passage and quest stubs: three passes through the same interface', () => {
    const results = {};
    for (const [k, s] of Object.entries(stubs)) results[k] = suite(s, graph);
    const views = Object.values(results).map((r) => JSON.stringify({ ...r.world, id: null, kind: null }));
    assert.ok(views.every((v) => v === views[0]), 'the same view over the same graph, whatever the kind');
    const states = Object.values(results).map((r) => JSON.stringify({ ...r.state, projects: r.state.projects.map((p) => ({ ...p, worldId: null })), continuation: { ...r.state.continuation, worldId: null }, journeys: r.state.journeys.map((j) => ({ ...j, worldId: null })) }));
    assert.ok(states.every((v) => v === states[0]), 'the same state layer, keyed only by world id');
    // a composed kanji reads its components from the graph too (data-chosen fixture)
    const composed = stubs.quest.open(graph, C);
    assert.deepEqual(composed.view.kanji[0].parts, componentsOf(partByLiteral.get(composedRow[I.head]).id)); assert.ok(composed.view.parts.length >= 2);
    assert.throws(() => m.openWorld(graph, { kind: 'arcade', entry: W, id: 'x' }), /invalid-world-kind/u);
    assert.throws(() => m.openWorld(graph, { kind: 'quest', entry: 'entry:0:nope|x', id: 'x' }), /unknown-entry/u);
    assert.throws(() => m.saveProject(m.createWorldState(), { worldId: 'w', projectId: 'p', placed: ['a'], at: 'now' }), /invalid-project/u);
    assert.throws(() => m.saveProject({ version: 1, projects: [], continuation: null, journeys: [], worldcraft: {} }, { worldId: 'w', projectId: 'p', placed: [], at }), /invalid-world-state/u, 'a second state bucket is refused');
  });

  await t.test('[2] the same stub suite against the base\'s three models fails on shape: they keep different state', () => {
    const quest = createQuestState();
    assert.notDeepEqual(Object.keys(quest).sort(), STATE_KEYS, 'm4-quest keeps its own state shape');
    assert.ok(!('projects' in quest) && !('continuation' in quest) && !('journeys' in quest));
    const owner = createWorldOwner({}, { read() { return null; } });
    const worldcraft = createWorldcraftState(owner.ok ? owner.value : owner), passage = createPassage(owner.ok ? owner.value : owner, { stops: [], edges: [] }, { motion: 'full' });
    for (const [name, value] of [['m4-worldcraft', worldcraft], ['m4-passage', passage]]) { assert.ok(value && typeof value === 'object' && value.ok === false, `${name} answers in its own {ok, reason} shape`); assert.notDeepEqual(Object.keys(value).sort(), STATE_KEYS); }
    const shapes = [quest, worldcraft, passage].map((v) => Object.keys(v).sort().join(','));
    assert.equal(new Set(shapes).size >= 2, true, 'the base models do not share one state');
    const baseAdapters = {
      quest: { kind: 'quest', open: () => quest, state: () => quest, save: () => quest, pause: () => quest, journey: () => quest },
      worldcraft: { kind: 'worldcraft', open: () => worldcraft, state: () => worldcraft, save: () => worldcraft, pause: () => worldcraft, journey: () => worldcraft },
      passage: { kind: 'passage', open: () => passage, state: () => passage, save: () => passage, pause: () => passage, journey: () => passage },
    };
    for (const [k, adapter] of Object.entries(baseAdapters)) assert.throws(() => suite(adapter, graph), `the suite fails against the base's ${k}`);
  });

  await t.test('[3] a world entered directly and from three other modes writes a return record that satisfies the G4 contract', () => {
    const world = stubs.worldcraft.open(graph, W);
    const place = { passageId: 'p-9', paragraph: 4, anchor: { kind: 'token', index: 12 }, scroll: { x: 0, y: 640 }, focus: { target: 'word:12' }, drafts: [{ id: 'd1' }], runs: [] };
    const records = [['direct', null], ['reader', place], ['drift', place], ['voice', { ...place, anchor: { kind: 'media', ms: 73000 } }]].map(([from, p]) => [from, m.enterWorld(world, { from, place: p })]);
    for (const [from, { returnRecord, world: w }] of records) {
      assert.equal(validateReturnRecord(returnRecord), true, `${from}: a valid G4 return record`);
      assert.equal(returnRecord.purpose.kind, 'world'); assert.ok(PURPOSES.includes(returnRecord.purpose.kind));
      assert.equal(returnRecord.object, W, 'the record names the entry id'); assert.equal(returnRecord.origin.surface, from); assert.strictEqual(w, world);
      assert.ok(Object.isFrozen(returnRecord));
    }
    assert.equal(records[2][1].returnRecord.origin.paragraph, 4); assert.deepEqual(records[3][1].returnRecord.anchor, { kind: 'media', ms: 73000 });
    assert.throws(() => m.enterWorld(world, { from: 'reader', place: { ...place, focus: undefined } }), /focus/u, 'a partial place is refused by the G4 contract');
    assert.throws(() => m.enterWorld(world, { from: 'teleport' }), /invalid-entrance/u);
  });

  await t.test('[4] Japanese in a world comes from the shared graph only: none typed into the world files; the doc\'s examples exist in the shipped data', () => {
    const files = [MODULE, ...STUBS.map(([, f]) => f)];
    for (const file of files) assert.ok(!CJK_RUN.test(readFileSync(file, 'utf8')), `${file.replace(ROOT + '/', '')} contains no Japanese`);
    for (const file of readdirSync(join(HERE, 'stubs')).map((f) => join(HERE, 'stubs', f))) assert.ok(!CJK_RUN.test(readFileSync(file, 'utf8')), `${file}: no Japanese`);
    const doc = readFileSync(DOC, 'utf8'), words = [...new Set(doc.match(CJK_RUN) || [])];
    assert.ok(words.length >= 1, 'the doc shows at least one example word');
    for (const w of words) assert.ok(dictionaryWords.has(w) || [...w].every((ch) => partByLiteral.has(ch)), `${w} is in the shipped dictionary or parts graph`);
    const world = stubs.passage.open(graph, W);
    const shown = JSON.stringify(world.view).match(CJK_RUN) || [];
    assert.ok(shown.length >= 1 && shown.every((w) => dictionaryWords.has(w) || [...w].every((ch) => partByLiteral.has(ch))), 'every character the world shows is in the data');
  });

  await t.test('nothing activates: world.mjs imports only the G13, G5, G4 and G9 contracts, the stubs only world.mjs; no store, network, clock, timer or random; spies at zero', () => {
    scanBanned(MODULE, ALLOWED_IMPORTS);
    for (const [, f] of STUBS) scanBanned(f, STUB_IMPORTS);
    suite(stubs.quest, graph); m.enterWorld(stubs.quest.open(graph, W), { from: 'direct' });
    assert.deepEqual(calls, { store: 0, fetch: 0 });
  });
});
