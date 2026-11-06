/** G14 judge: text and voice corrections share one record with original, basis, status and retraction, keyed by attempt
 * id (campaign/contracts/G14.json; SPEC S11-R6). Pinned by the contract; the worker writes ledger.mjs beside this file and
 * may not edit this file. The voice fixture is the base's own: a Speak turn parsed by speak-core.mjs parseTurn with the
 * correction tools/test-speak-core.mjs already uses (processing → 加工, prod-gap); the text fixture is a particle mark
 * (は → が, particle-drop) labelled unreviewed. Authored by the Bunki lead 2026-11-06; TESTS_SOUND by a second family. */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { parseTurn, SENSEI_CODES } from '../../speak-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..', '..');
const MODULE = join(HERE, 'ledger.mjs');
const ALLOWED_IMPORTS = new Set(['../../speak-core.mjs']);
const BANNED = ['indexedDB', 'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest', 'setTimeout', 'setInterval', 'queueMicrotask', 'Date', 'performance', 'window', 'self', 'document', 'navigator', 'globalThis', 'process', 'require'];
const EXPORTS = ['BASIS_KINDS', 'CORRECTION_CHANNELS', 'CORRECTION_STATUSES', 'CorrectionLedgerError', 'ROW_KINDS', 'SENSEI_CODES', 'addCorrection', 'correctionsFor', 'emptyLedger', 'fromSpeakTurn', 'parseLedger', 'qualifyCorrection', 'retractCorrection', 'spokenView', 'textView'];
const ROW_KEYS = ['attemptId', 'basis', 'channel', 'id', 'kind', 'note', 'original', 'retraction', 'status'];
const RETRACTION_KEYS = ['at', 'attemptId', 'by', 'id', 'kind', 'of', 'reason'];
const at = 1762300800000;
/** the base's voice path: the turn tools/test-speak-core.mjs parses (one sound correction, one invented code dropped) */
const SPEAK_TURN = JSON.stringify({
  heard: 'まだないんです。えっと、真珠の… processing? のために…', heardKana: 'マダナインデス',
  reply: { text: 'ああ、真珠の加工ですね。', tokens: [{ s: 'ああ', b: 'ああ', r: 'ああ' }, { s: '、', b: '、', r: '' }, { s: '真珠', b: '真珠', r: 'しんじゅ' }] },
  corrections: [{ wrong: 'processing', right: '加工', rightReading: 'かこう', code: 'prod-gap', subject: '加工', subjectType: 'word' }, { wrong: 'a', right: 'b', code: 'invented-code' }],
  reached: [], used: [], remember: [],
});
const TEXT_CORRECTION = { wrong: 'は', right: 'が', rightReading: 'が', code: 'particle-drop' };   // unreviewed fixture: a particle mark, no claim about the sentence
const textOn = (attemptId, id = `${attemptId}:t1`) => ({ id, attemptId, channel: 'text', original: TEXT_CORRECTION, basis: { kind: 'reviewer', ref: 'unreviewed-fixture', at } });

const calls = { store: 0, fetch: 0 };
globalThis.localStorage = { getItem() { calls.store += 1; return null; }, setItem() { calls.store += 1; }, removeItem() { calls.store += 1; } };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.indexedDB = { open() { calls.store += 1; throw new Error('no store'); } };
globalThis.fetch = () => { calls.fetch += 1; return Promise.reject(new Error('no network')); };

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!['node_modules', 'vendor', 'data', 'contracts', 'tools'].includes(entry.name)) yield* sourceFiles(join(dir, entry.name)); }
    else if (/\.(mjs|js)$/u.test(entry.name)) yield join(dir, entry.name);
  }
}

test('correction contract · G14', async (t) => {
  let m, turn;
  await t.test('the ledger module exists and exports exactly the contract; the base\'s Speak turn parses with its one sound correction', async () => {
    assert.ok(existsSync(MODULE), 'ledger.mjs exists');
    m = await import(pathToFileURL(MODULE));
    assert.deepEqual(Object.keys(m).sort(), EXPORTS, 'the export surface is exactly the contract: no delete, no merge');
    turn = parseTurn(SPEAK_TURN);
    assert.ok(turn && turn.corrections.length === 1 && turn.corrections[0].code === 'prod-gap', 'the base keeps the sound correction and drops the invented code');
    assert.ok(!('attemptId' in turn.corrections[0]), 'the base\'s voice correction is keyed to no attempt');
  });

  await t.test('[0] a text correction on A1 and a voice correction on A2 are rows of one ledger keyed by attempt id, with original, basis, status and retraction', () => {
    let ledger = m.addCorrection(m.emptyLedger(), textOn('A1'));
    ledger = m.fromSpeakTurn(ledger, turn, { attemptId: 'A2', at: at + 1, ref: 'speak-turn:7' });
    assert.equal(ledger.rows.length, 2);
    for (const row of ledger.rows) { assert.deepEqual(Object.keys(row).sort(), ROW_KEYS, 'a row is exactly {kind, id, attemptId, channel, original, basis, status, note, retraction}'); assert.equal(row.kind, 'correction'); assert.equal(row.status, 'open'); assert.equal(row.retraction, null); }
    assert.deepEqual(ledger.rows.map((r) => [r.attemptId, r.channel, r.original.wrong, r.original.right, r.original.code, r.basis.kind]), [['A1', 'text', 'は', 'が', 'particle-drop', 'reviewer'], ['A2', 'voice', 'processing', '加工', 'prod-gap', 'sensei']]);
    assert.deepEqual(ledger.rows[1].original, { wrong: 'processing', right: '加工', rightReading: 'かこう', code: 'prod-gap', subject: '加工', subjectType: 'word' }, 'the voice original is the Speak sensei\'s mark, byte for byte');
    assert.deepEqual(ledger.rows[1].basis, { kind: 'sensei', ref: 'speak-turn:7', at: at + 1 });
    assert.ok(Object.isFrozen(ledger) && Object.isFrozen(ledger.rows) && Object.isFrozen(ledger.rows[0].original));
    assert.deepEqual(m.parseLedger(JSON.parse(JSON.stringify(ledger))), ledger, 'survives a storage round trip');
    assert.strictEqual(m.addCorrection(ledger, textOn('A1')), ledger, 'a retry is idempotent');
    assert.throws(() => m.addCorrection(ledger, { ...textOn('A1'), original: { ...TEXT_CORRECTION, right: 'を' } }), /correction-conflict/u);
    assert.throws(() => m.addCorrection(ledger, { ...textOn('A3'), original: { ...TEXT_CORRECTION, code: 'invented-code' } }), /invalid-original/u, 'only the sensei codes');
    assert.deepEqual([...m.SENSEI_CODES], [...SENSEI_CODES], 'the codes are speak-core\'s');
  });

  await t.test('[1] the text view after the voice correction is added lists A2\'s correction; on the base it cannot', () => {
    const ledger = m.fromSpeakTurn(m.addCorrection(m.emptyLedger(), textOn('A1')), turn, { attemptId: 'A2', at, ref: 'speak-turn:7' });
    const view = m.textView(ledger, 'A2');
    assert.equal(view.view, 'text'); assert.equal(view.corrections.length, 1); assert.equal(view.corrections[0].channel, 'voice'); assert.equal(view.corrections[0].original.right, '加工');
    assert.equal(m.textView(ledger, 'A1').corrections.length, 1); assert.equal(m.textView(ledger, 'A9').corrections.length, 0);
    // the base: the voice correction lives inside the Speak turn result and no text-side module reads it
    const readers = [];
    for (const file of sourceFiles(CORRIDOR)) {
      if (/speak(-core)?\.(mjs|js)$/u.test(file)) continue;
      const source = readFileSync(file, 'utf8');
      if (/\bcorrections\b/u.test(source) && /\.corrections\b/u.test(source)) readers.push(file.replace(CORRIDOR + '/', ''));
    }
    assert.deepEqual(readers, [], 'no module outside Speak reads a turn\'s corrections: the base has no text view of a voice correction');
    const baseTextView = (parsed, attemptId) => parsed.corrections.filter((c) => c.attemptId === attemptId);   // what the base can offer: nothing is keyed
    assert.throws(() => assert.ok(baseTextView(turn, 'A2').length >= 1), 'the ledger\'s text-view assertion fails against the base\'s path');
  });

  await t.test('[2] a disputed correction retracted by the learner or a reviewer: status retracted, original and basis readable, the retraction is a row', () => {
    const ledger = m.fromSpeakTurn(m.addCorrection(m.emptyLedger(), textOn('A1')), turn, { attemptId: 'A2', at, ref: 'speak-turn:7' });
    const retracted = m.retractCorrection(ledger, 'A2:c1', { by: 'learner', reason: 'I said 加工 in the next line', at: at + 50 });
    const row = retracted.rows.find((r) => r.id === 'A2:c1');
    assert.equal(row.status, 'retracted'); assert.deepEqual(row.original, ledger.rows[1].original, 'the original stays readable'); assert.deepEqual(row.basis, ledger.rows[1].basis, 'and the basis');
    assert.deepEqual(row.retraction, { by: 'learner', reason: 'I said 加工 in the next line', at: at + 50, row: 'A2:c1:retraction' });
    const retraction = retracted.rows.find((r) => r.kind === 'retraction');
    assert.ok(retraction, 'the retraction is itself a row'); assert.deepEqual(Object.keys(retraction).sort(), RETRACTION_KEYS); assert.equal(retraction.of, 'A2:c1'); assert.equal(retraction.attemptId, 'A2');
    assert.equal(retracted.rows.length, ledger.rows.length + 1, 'nothing removed, one row added');
    assert.strictEqual(m.retractCorrection(retracted, 'A2:c1', { by: 'learner', reason: 'again', at: at + 60 }), retracted, 'retracting twice adds nothing');
    const byReviewer = m.retractCorrection(ledger, 'A1:t1', { by: 'native-reviewer', reason: 'both particles are natural here', at: at + 70 });
    assert.equal(byReviewer.rows.find((r) => r.id === 'A1:t1').status, 'retracted');
    assert.throws(() => m.retractCorrection(ledger, 'A2:c1', { by: 'learner', at: at + 50 }), /invalid-retraction/u, 'a retraction names its reason');
    assert.throws(() => m.retractCorrection(ledger, 'nope', { by: 'learner', reason: 'x', at }), /unknown-correction/u);
    assert.throws(() => m.qualifyCorrection(retracted, 'A2:c1', { note: 'late', by: 'reviewer', at }), /correction-retracted/u);
    assert.deepEqual(m.correctionsFor(retracted, 'A2').map((r) => r.kind), ['correction', 'retraction'], 'both rows belong to the attempt');
  });

  await t.test('[3] a correction qualified as partly right keeps its status qualified with the note, never deleted', () => {
    const ledger = m.addCorrection(m.emptyLedger(), textOn('A1'));
    const qualified = m.qualifyCorrection(ledger, 'A1:t1', { note: 'が is better here, but は is not wrong', by: 'native-reviewer', at: at + 5 });
    const row = qualified.rows.find((r) => r.id === 'A1:t1');
    assert.equal(row.status, 'qualified'); assert.deepEqual(row.note, { text: 'が is better here, but は is not wrong', by: 'native-reviewer', at: at + 5 });
    assert.deepEqual(row.original, ledger.rows[0].original); assert.equal(qualified.rows.length, 1, 'still there');
    assert.throws(() => m.qualifyCorrection(ledger, 'A1:t1', { by: 'reviewer', at }), /invalid-qualification/u, 'a qualification carries its note');
    assert.ok(!Object.keys(m).some((k) => /delete|remove|purge|clear/iu.test(k)), 'the ledger has no delete');
  });

  await t.test('[4] the spoken and the written view of one attempt id are the same correction rows (S11-R6)', () => {
    let ledger = m.fromSpeakTurn(m.addCorrection(m.emptyLedger(), textOn('A2', 'A2:t1')), turn, { attemptId: 'A2', at, ref: 'speak-turn:7' });
    ledger = m.retractCorrection(ledger, 'A2:t1', { by: 'learner', reason: 'disputed', at: at + 9 });
    const spoken = m.spokenView(ledger, 'A2'), text = m.textView(ledger, 'A2');
    assert.deepEqual(spoken.corrections, text.corrections, 'the same rows');
    assert.deepEqual(spoken.corrections.map((r) => [r.kind, r.channel ?? null, r.status ?? null]), [['correction', 'text', 'retracted'], ['correction', 'voice', 'open'], ['retraction', null, null]]);
    assert.equal(spoken.view, 'spoken'); assert.equal(text.view, 'text');
    assert.deepEqual(m.correctionsFor(ledger, 'A2'), spoken.corrections);
  });

  await t.test('[5] a correction with no attempt id is rejected', () => {
    for (const bad of [{ ...textOn('A1'), attemptId: '' }, { ...textOn('A1'), attemptId: '   ' }, { ...textOn('A1'), attemptId: null }, (() => { const { attemptId, ...rest } = textOn('A1'); return rest; })()])
      assert.throws(() => m.addCorrection(m.emptyLedger(), bad), /attempt-id-required/u);
    assert.throws(() => m.fromSpeakTurn(m.emptyLedger(), turn, { at, ref: 'speak-turn:7' }), /attempt-id-required/u);
    assert.throws(() => m.correctionsFor(m.emptyLedger(), ''), /attempt-id-required/u);
    assert.throws(() => m.parseLedger({ version: 1, rows: [{ kind: 'correction', id: 'x', attemptId: '' }] }), /invalid-ledger/u);
  });

  await t.test('nothing activates: imports only speak-core (for the codes); no store, network, clock or timer; spies at zero', () => {
    const sf = ts.createSourceFile(MODULE, readFileSync(MODULE, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt)) { assert.ok(ALLOWED_IMPORTS.has(stmt.moduleSpecifier.text), `import ${stmt.moduleSpecifier.text} is allowed`); continue; }
      if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) assert.ok(ALLOWED_IMPORTS.has(stmt.moduleSpecifier.text));
      assert.ok(ts.isExportDeclaration(stmt) || ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || (ts.isVariableStatement(stmt) && (stmt.declarationList.flags & ts.NodeFlags.Const)), `declaration, not action: ${stmt.getText(sf).slice(0, 50)}`);
    }
    const seen = new Set();
    const bare = (node) => !((ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) || (ts.isPropertyAssignment(node.parent) && node.parent.name === node));
    const visit = (node) => { if (ts.isIdentifier(node) && BANNED.includes(node.text) && bare(node)) seen.add(node.text); if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) seen.add('import()'); ts.forEachChild(node, visit); };
    visit(sf); assert.deepEqual([...seen], []);
    assert.deepEqual(calls, { store: 0, fetch: 0 });
  });
});
