import {assertPureModules} from '../../../../scripts/ci/pure-module-runtime-probe.mjs';
/** G12 judge: one read model of evidence with modality, assistance, source and declared coverage per source
 * (campaign/contracts/G12.json; SPEC S8-R7, S8-R9). Pinned by the contract; the worker writes projection.mjs beside this
 * file and may not edit this file. Fixtures are built with G9's identity builders and G6a's typed task events; the domain's
 * invariants are mirrored: an exposure is never retrieval (T-08), a lookup is friction and never a grade (T-07).
 * Authored by the Bunki lead 2026-11-06; TESTS_SOUND by a second family before pinning. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { entryId, readingId, senseId, taskId } from '../identity/identity.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE = join(HERE, 'projection.mjs');
const ALLOWED_IMPORTS = new Set(['../identity/identity.mjs', '../learner-state/task-contract.mjs']);
const BANNED = ['indexedDB', 'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest', 'setTimeout', 'setInterval', 'queueMicrotask', 'Date', 'performance', 'Math.random', 'window', 'self', 'document', 'navigator', 'globalThis', 'process', 'require'];
const EXPORTS = ['CONCERNS', 'FEEDBACK_CHANNELS', 'OBSERVATION_KINDS', 'ProjectionError', 'RETRIEVAL_KINDS', 'parseObservation', 'project'];
const ROW_KEYS = ['assistance', 'attempts', 'entry', 'evidenceIds', 'kinds', 'lastAt', 'modality', 'source', 'surface'];
const ESTIMATE_KEYS = ['basis', 'entry', 'method', 'modality', 'value'];

const W = entryId({ seq: '1358280', spelling: '食べる', reading: 'たべる' });
const taskW = taskId({ entry: W, reading: readingId({ kanji: '食べる', reading: 'たべる' }), sense: senseId({ entry: W, index: 1 }), modality: 'recognition' });
const V = entryId({ seq: '1445160', spelling: '度', reading: 'ど' });
const at = 1762300800000;
const obs = (id, kind, modality, assistance = 'none', source = { surface: 'reader', at, sourceId: 'src-textbook' }, entry = W) => ({ id, kind, entry, modality, assistance, source });
const recall = (id, modality = 'reading-recognition', answer = { rating: 3 }, assistance = 'none', surface = 'Rajomon') => ({ id, kind: 'recall', event: { kind: 'graded', task: taskW, modality, answer, assistance, source: { surface, action: 'answer', at } } });
const LOG = [
  obs('ev-1', 'exposure', 'reading-recognition'),                                       // a passive view of W
  obs('ev-2', 'lookup', 'reading-recognition', 'none', { surface: 'reader', at: at + 1, sourceId: 'src-textbook' }),   // a lookup
  recall('ev-3'),                                                                        // a recognition recall
  obs('ev-4', 'imitation', 'speaking', 'hint', { surface: 'Speak', at: at + 2 }),        // a spoken imitation with assistance
  obs('ev-5', 'production', 'writing', 'none', { surface: 'M4', at: at + 3 }),           // an independent written production
];
const SOURCES = [{ sourceId: 'src-textbook', coverage: { covered: 40, of: 100 } }, { sourceId: 'src-podcast', coverage: null }];
const clone = (v) => JSON.parse(JSON.stringify(v));
const deepFreeze = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(deepFreeze); Object.freeze(v); } return v; };

const calls = { store: 0, fetch: 0 };
globalThis.localStorage = { getItem() { calls.store += 1; return null; }, setItem() { calls.store += 1; }, removeItem() { calls.store += 1; } };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.indexedDB = { open() { calls.store += 1; throw new Error('no store'); } };
globalThis.fetch = () => { calls.fetch += 1; return Promise.reject(new Error('no network')); };

test('learner-projection contract · G12', async (t) => {
  let m;
  await t.test('the projection module exists and exports exactly the contract', async () => {
    assert.ok(existsSync(MODULE), 'projection.mjs exists');
    m = await import(pathToFileURL(MODULE));
    assert.deepEqual(Object.keys(m).sort(), EXPORTS, 'the export surface is exactly the contract');
    assert.deepEqual([...m.CONCERNS], ['knowledge', 'live', 'evidence', 'estimates']);
  });

  await t.test('[0] one row per modality with assistance and source; the passive view and the lookup raise no mastery or recall estimate (S8-R7)', () => {
    const p = m.project({ events: LOG, sources: SOURCES });
    const rows = p.evidence.rows;
    assert.deepEqual(rows.map((r) => [r.modality, r.assistance, r.source, r.attempts]).sort(), [['reading-recognition', 'none', 'Rajomon', 1], ['speaking', 'hint', 'Speak', 1], ['writing', 'none', 'M4', 1]], 'three retrieval rows: recall, assisted imitation, independent production — each with its assistance level and source');
    for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ROW_KEYS, 'a row is exactly {entry, modality, assistance, source, surface, kinds, attempts, lastAt, evidenceIds}');
    assert.ok(rows.every((r) => r.entry === W));
    assert.deepEqual(rows.map((r) => r.kinds), [['recall'], ['imitation'], ['production']], 'kinds stay distinct: a recall, an imitation and a production are never one practice count');
    assert.deepEqual(rows.map((r) => r.evidenceIds), [['ev-3'], ['ev-4'], ['ev-5']]);
    // the exposure and the lookup: recorded (knowledge), never an attempt, never an estimate
    assert.equal(rows.reduce((n, r) => n + r.attempts, 0), 3, 'the exposure and the lookup are not attempts');
    assert.deepEqual(p.knowledge.encounters, { [W]: ['src-textbook'] }, 'the passive view is remembered as an encounter from its source');
    assert.deepEqual(p.knowledge.friction, { [W]: 1 }, 'the lookup is friction, remembered as a nomination signal');
    assert.deepEqual(p.estimates.rows.map((e) => [e.modality, e.basis]), [['reading-recognition', ['ev-3']], ['speaking', ['ev-4']], ['writing', ['ev-5']]], 'estimates rest on retrievals only');
    for (const e of p.estimates.rows) { assert.deepEqual(Object.keys(e).sort(), ESTIMATE_KEYS); assert.equal(e.value, null, 'the numeric estimate is out of scope: null, with its basis'); assert.ok(!e.basis.includes('ev-1') && !e.basis.includes('ev-2')); }
    const passive = m.project({ events: [LOG[0], LOG[1]], sources: SOURCES });
    assert.deepEqual(passive.evidence.rows, [], 'a passive view and a lookup alone give no evidence row');
    assert.deepEqual(passive.estimates.rows, [], 'and no estimate');
    assert.deepEqual(passive.knowledge.entries, [W], 'but W is known to the model');
    // an unlabelled kind is never a practice: a shape outside the six kinds is refused by name
    assert.throws(() => m.project({ events: [{ id: 'x', kind: 'practice', entry: W, modality: 'writing', assistance: 'none', source: { surface: 'M4', at } }] }), /unknown-observation-kind/u);
    assert.throws(() => m.project({ events: [{ ...obs('ev-9', 'imitation', 'speaking', 'none', { surface: 'Speak', at }) }] }), /invalid-assistance/u, 'an imitation without assistance is not an imitation');
    assert.throws(() => m.project({ events: [{ ...obs('ev-9', 'production', 'speaking', 'hint', { surface: 'Speak', at }) }] }), /invalid-assistance/u, 'an assisted production is not independent');
    assert.throws(() => m.project({ events: [{ ...obs('ev-9', 'exposure', 'speaking', 'hint') }] }), /invalid-assistance/u);
  });

  await t.test('[1] the exposure repeated 100 times: byte-identical output', () => {
    const once = JSON.stringify(m.project({ events: LOG, sources: SOURCES }));
    const repeated = [...LOG, ...Array.from({ length: 100 }, (_, i) => obs(`ev-exp-${i}`, 'exposure', 'reading-recognition', 'none', { surface: 'reader', at: at + 10 + i, sourceId: 'src-textbook' }))];
    assert.equal(JSON.stringify(m.project({ events: repeated, sources: SOURCES })), once, 'one hundred more passive views change nothing');
    const otherSurface = [...LOG, obs('ev-exp-x', 'exposure', 'listening', 'none', { surface: 'podcast', at: at + 500, sourceId: 'src-podcast' })];
    assert.deepEqual(m.project({ events: otherSurface, sources: SOURCES }).knowledge.encounters[W], ['src-podcast', 'src-textbook'], 'a new source of exposure is a new encounter, still not an attempt');
    assert.equal(m.project({ events: otherSurface, sources: SOURCES }).evidence.rows.length, 3);
  });

  await t.test('[2] declared coverage per source is reported as declared (40/100) and never extrapolated', () => {
    const p = m.project({ events: LOG, sources: SOURCES });
    assert.deepEqual(p.evidence.coverage, { 'src-textbook': { covered: 40, of: 100, declared: '40/100' }, 'src-podcast': null }, 'declared or null; nothing inferred from the events');
    // events from a source never move its coverage, and an undeclared source gets no number
    const many = [...LOG, ...Array.from({ length: 60 }, (_, i) => obs(`ev-cov-${i}`, 'production', 'writing', 'none', { surface: 'M4', at: at + 100 + i, sourceId: 'src-textbook' }, entryId({ seq: String(2000000 + i), spelling: `語${i}`, reading: 'ご' })))];
    const q = m.project({ events: many, sources: SOURCES });
    assert.deepEqual(q.evidence.coverage['src-textbook'], { covered: 40, of: 100, declared: '40/100' }, 'sixty productions from the source do not raise its declared 40/100');
    assert.equal(q.evidence.coverage['src-podcast'], null); assert.ok(!('src-unknown' in q.evidence.coverage));
    assert.equal(m.project({ events: [], sources: [{ sourceId: 's', coverage: { covered: 0, of: 7 } }] }).evidence.coverage.s.declared, '0/7');
    assert.throws(() => m.project({ sources: [{ sourceId: 's', coverage: { covered: 101, of: 100 } }] }), /invalid-declared-source/u);
    assert.throws(() => m.project({ sources: [{ sourceId: 's', coverage: { covered: 40, of: 100, ratio: 0.4 } }] }), /invalid-declared-source/u, 'a declared ratio is not accepted beside the counts');
    const text = JSON.stringify(p);
    assert.ok(!/extrapolat|estimatedCoverage|projectedCoverage/iu.test(text));
  });

  await t.test('[3] four concerns under four keys; an estimate is never written back into the evidence log (S8-R9)', () => {
    const events = deepFreeze(clone(LOG)), sources = deepFreeze(clone(SOURCES)); const before = JSON.stringify({ events, sources });
    const p = m.project({ events, sources });
    assert.deepEqual(Object.keys(p).sort(), ['estimates', 'evidence', 'knowledge', 'live'], 'exactly the four concerns');
    assert.equal(JSON.stringify({ events, sources }), before, 'the log is unchanged');
    assert.ok(!JSON.stringify(p.evidence).includes('"value"') && !/estimate/iu.test(JSON.stringify(p.evidence)), 'evidence carries no estimate');
    assert.ok(!JSON.stringify(p.knowledge).includes('attempts'), 'knowledge carries no evidence counts');
    assert.ok(p.estimates.rows.every((e) => e.basis.every((id) => events.some((ev) => ev.id === id))), 'an estimate names its evidence by id, never copies it');
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.evidence.rows) && Object.isFrozen(p.estimates.rows));
    assert.deepEqual(p.live.lastAttempt, { attemptId: 'ev-5', kind: 'production', at: at + 3 }, 'the live concern holds the open thread');
    assert.deepEqual(p.live.attempts.map((a) => a.attemptId), ['ev-3', 'ev-4', 'ev-5']);
  });

  await t.test('[4] oral and written feedback on the same attempt point to the same evidence id', () => {
    const fb = [{ id: 'fb-1', kind: 'feedback', attemptId: 'ev-4', channel: 'oral', text: '「て」が落ちています' }, { id: 'fb-2', kind: 'feedback', attemptId: 'ev-4', channel: 'written', text: 'particle dropped' }];
    const p = m.project({ events: [...LOG, ...fb], sources: SOURCES });
    assert.deepEqual(p.live.feedback.map((f) => [f.id, f.channel, f.evidenceId]), [['fb-1', 'oral', 'ev-4'], ['fb-2', 'written', 'ev-4']]);
    assert.equal(p.live.feedback[0].evidenceId, p.live.feedback[1].evidenceId, 'one evidence id for both channels');
    assert.ok(p.evidence.rows.find((r) => r.evidenceIds.includes('ev-4')), 'and it is the row\'s own evidence id');
    assert.throws(() => m.project({ events: [...LOG, { ...fb[0], attemptId: 'ev-1' }] }), /unknown-attempt/u, 'feedback on an exposure names no attempt');
    assert.throws(() => m.project({ events: [...LOG, { ...fb[0], attemptId: 'nope' }] }), /unknown-attempt/u);
    assert.throws(() => m.project({ events: [...LOG, { ...fb[0], channel: 'telepathic' }] }), /invalid-feedback/u);
    assert.throws(() => m.project({ events: [...LOG, LOG[0]] }), /duplicate-observation/u);
    assert.equal(m.project({ events: [...LOG, ...fb] }).evidence.rows.length, 3, 'feedback is not evidence of recall');
  });

  await t.test('no observed activation on isolated projection import and fixtures',()=>{
    const sf=ts.createSourceFile(MODULE,readFileSync(MODULE,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    for(const stmt of sf.statements)if(ts.isImportDeclaration(stmt)||(ts.isExportDeclaration(stmt)&&stmt.moduleSpecifier))assert.ok(ALLOWED_IMPORTS.has(stmt.moduleSpecifier.text),'declared dependency remains within contract');
    assert.deepEqual(assertPureModules({files:[MODULE],data:{events:LOG,sources:SOURCES},exercise:([m],d)=>{m.project(d);m.parseObservation(d.events[0]);}}).calls,[]);
  });
});
