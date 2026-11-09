/** G13 judge: one entry object keyed by entry, reading and sense ids, shared by dictionary search and the word card
 * (campaign/contracts/G13.json; SPEC S2-R18, S9). Pinned by the contract; the worker implements ./entry.mjs so every
 * fixture passes and may not edit this file. The fixtures come from the shipped dictionary data itself
 * (data/share_alike/dict.json core + dict-v2/index.json and shards): the word 食べる, a homograph the index holds under two
 * seqs, and the index's own provenance block. The base's two producers (reference-core.js searchEntries and corridor.js
 * wordCardIdentity) are executed on the same dictionary fixture and shown to carry no contract entry/reading/sense ids.
 * Authored by the Bunki lead 2026-11-06; TESTS_SOUND by a second family before pinning. */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';
import { entryId, readingId, senseId } from '../identity/identity.mjs';
import { createReturnRecord, validateReturnRecord } from '../return/return.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = join(HERE, '..', '..');
const DATA = join(CORRIDOR, 'data', 'share_alike');
const WORD = '食べる';

// ---- the shipped dictionary data, loaded once (the implementation receives the same handle) --------------------------
let shipped;
function data() {
  if (shipped) return shipped;
  const core = JSON.parse(readFileSync(join(DATA, 'dict.json'), 'utf8'));
  const index = JSON.parse(readFileSync(join(DATA, 'dict-v2', 'index.json'), 'utf8'));
  const shards = {};
  for (let i = 0; i < 16; i += 1) {
    const id = i.toString(16).padStart(2, '0');
    const p = join(DATA, 'dict-v2', `${id}.json`);
    if (existsSync(p)) shards[id] = JSON.parse(readFileSync(p, 'utf8'));
  }
  shipped = { core, index, shards };
  return shipped;
}
const I = { seq: 0, head: 1, primaryReading: 2, primaryGloss: 3, writtenForms: 4, kanaForms: 5, glosses: 6, senseTagRows: 12 };
function indexRows(head) { return data().index.entries.filter((e) => e[I.head] === head); }
function firstHomograph() {
  const by = new Map();
  for (const e of data().index.entries) {
    if (/[A-Za-z]/u.test(e[I.head])) continue;
    const k = `${e[I.head]}|${e[I.primaryReading]}`;
    by.set(k, [...(by.get(k) || []), e[I.seq]]);
  }
  const hit = [...by.entries()].find(([, seqs]) => seqs.length >= 2);
  assert.ok(hit, 'fixture: the index holds no spelling+reading under two seqs');
  const [head, reading] = hit[0].split('|');
  return { head, reading, seqs: hit[1].slice().sort() };
}
/** sense ids the contract expects for an index row: one per senseTagRow, in source order */
function expectedIds(row) {
  const entry = entryId({ seq: row[I.seq], spelling: row[I.head], reading: row[I.primaryReading] });
  const reading = readingId({ kanji: row[I.head], reading: row[I.primaryReading] });
  const senses = row[I.senseTagRows].map((_, i) => senseId({ entry, index: i + 1 }));
  return { entry, reading, senses };
}

// Parse only to locate the actual legacy declaration; returned values come from execution.
function legacyCardProducer() {
  const file = join(CORRIDOR, 'corridor.js');
  const source = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declaration = sf.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'wordCardIdentity');
  assert.ok(declaration);
  const context = vm.createContext({
    plainRecord: value => value != null && typeof value === 'object' && !Array.isArray(value),
    owns: (value, key) => Object.hasOwn(value, key),
    nonEmptyString: value => typeof value === 'string' && value.length > 0,
    D: { dict: data().core },
  });
  vm.runInContext(declaration.getText(sf), context);
  return context.wordCardIdentity;
}
function legacySearchProducer() {
  const context = vm.createContext({ module: { exports: {} } });
  vm.runInContext(readFileSync(join(CORRIDOR, 'reference-core.js'), 'utf8'), context);
  return context.module.exports.searchEntries;
}

test('word entry contract · G13', async (t) => {
  let impl, catalog;
  await t.test('the implementation exists and builds a catalog over the shipped data', async () => {
    impl = await import('./entry.mjs');
    assert.equal(typeof impl.createEntryCatalog, 'function', 'entry.mjs exports createEntryCatalog(data)');
    catalog = impl.createEntryCatalog(data());
    for (const f of ['fromSearch', 'fromCard', 'fuller', 'explain', 'returnRecordFor']) assert.equal(typeof catalog[f], 'function', `catalog.${f}`);
  });

  await t.test(`[0] ${WORD} through dictionary search and as the word card: one entry object, same entry, reading and sense ids, same first answer`, () => {
    const rows = indexRows(WORD);
    assert.ok(rows.length >= 1, `${WORD} is in the shipped index`);
    const row = rows[0]; const want = expectedIds(row);
    const viaSearch = catalog.fromSearch(WORD).find((o) => o.entry === want.entry);
    const viaCard = catalog.fromCard({ seq: row[I.seq], spelling: WORD, reading: row[I.primaryReading] });
    assert.ok(viaSearch, 'search returns the entry object');
    assert.ok(viaCard, 'the card path returns the entry object');
    for (const o of [viaSearch, viaCard]) {
      assert.equal(o.entry, want.entry, 'G9 entry id');
      assert.equal(o.reading, want.reading, 'G9 reading id');
      assert.deepEqual(o.senses.map((s) => s.id), want.senses, 'G9 sense ids in source order');
      assert.equal(o.spelling, WORD); assert.equal(o.readingText, row[I.primaryReading]);
    }
    assert.equal(viaSearch.firstAnswer.text, viaCard.firstAnswer.text, 'the same first-answer sense text from both paths');
    assert.equal(viaSearch.firstAnswer.text, row[I.glosses][row[I.senseTagRows][0][0]], 'the first answer is the first sense\'s first gloss');
    assert.equal(viaSearch.firstAnswer.sense, want.senses[0]);
    assert.deepEqual(viaSearch, viaCard, 'one object, not two shapes');
    assert.equal(data().core.words[WORD].m[0], viaSearch.firstAnswer.text, 'the core dictionary agrees with the first answer');
  });

  await t.test('[1] the first answer is the sense for this occurrence; the fuller entry is one step away through the same object; the place is recoverable through a G4 return record', () => {
    const row = indexRows(WORD)[0]; const want = expectedIds(row);
    assert.ok(row[I.senseTagRows].length >= 2, `${WORD} has at least two senses in the index`);
    const second = catalog.fromCard({ seq: row[I.seq], spelling: WORD, reading: row[I.primaryReading], occurrence: { sense: 2 } });
    assert.equal(second.firstAnswer.sense, want.senses[1], 'the occurrence selects its sense');
    assert.equal(second.firstAnswer.text, row[I.glosses][row[I.senseTagRows][1][0]], 'and its text');
    assert.equal(second.entry, want.entry, 'same entry id regardless of the sense in focus');
    const full = catalog.fuller(second);
    assert.equal(full.entry, want.entry); assert.equal(full.reading, want.reading);
    assert.deepEqual(full.senses.map((s) => s.id), want.senses);
    assert.ok(full.senses.every((s) => Array.isArray(s.glosses) && s.glosses.length >= 1 && s.glosses.every((g) => typeof g === 'string' && g)), 'the fuller entry carries every gloss of every sense');
    assert.ok(full.senses[0].glosses.length + full.senses[1].glosses.length <= row[I.glosses].length);
    assert.ok(full.forms && Array.isArray(full.forms.written) && full.forms.written.includes(WORD), 'and its written forms');
    const place = { surface: 'reader', passageId: 'p-1', paragraph: 3, anchor: { kind: 'token', index: 9 }, scroll: { x: 0, y: 120 }, focus: { target: `word:${WORD}:9` } };
    const rec = catalog.returnRecordFor(second, place, { purpose: 'word-entry', question: 'which sense here?' });
    assert.equal(validateReturnRecord(rec), true, 'a valid G4 return record');
    assert.equal(rec.object, want.entry, 'the return record names the entry id');
    assert.equal(rec.origin.paragraph, 3); assert.equal(rec.purpose.kind, 'word-entry');
    assert.ok(Object.isFrozen(rec));
    // the same builder the contract uses, so a hand-rolled record with a missing field is refused
    assert.throws(() => catalog.returnRecordFor(second, { ...place, focus: undefined }, { purpose: 'word-entry' }), /focus/u);
    assert.equal(typeof createReturnRecord, 'function');
  });

  await t.test('[2] a spelling under two entries gives two entry ids, never merged', () => {
    const { head, reading, seqs } = firstHomograph();
    const objs = catalog.fromSearch(head).filter((o) => o.spelling === head && o.readingText === reading);
    const ids = new Set(objs.map((o) => o.entry));
    assert.ok(ids.size >= 2, `${head}/${reading} under seqs ${seqs.join(', ')} gives ${ids.size} entry ids`);
    for (const seq of seqs) {
      const want = entryId({ seq, spelling: head, reading });
      assert.ok(ids.has(want), `search carries ${want}`);
      const card = catalog.fromCard({ seq, spelling: head, reading });
      assert.equal(card.entry, want, 'the card path keeps the seq');
    }
    assert.throws(() => catalog.fromCard({ spelling: head, reading }), /seq|ambiguous/u, 'a card without a seq on a homograph is refused, not guessed');
  });

  await t.test("[3] every fact carries dataset, version and licence; generated explanation text carries a 'generated' flag", () => {
    const row = indexRows(WORD)[0];
    const o = catalog.fromCard({ seq: row[I.seq], spelling: WORD, reading: row[I.primaryReading] });
    const src = data().index.source;
    assert.ok(Array.isArray(o.facts) && o.facts.length >= 1, 'facts');
    for (const f of o.facts) {
      assert.ok(typeof f.text === 'string' && f.text, 'fact text');
      assert.equal(f.provenance.dataset, src.name, 'dataset = the index source name');
      assert.equal(f.provenance.version, src.pin, 'version = the index pin');
      assert.equal(f.provenance.licence, src.licence, 'licence = the index licence');
      assert.notEqual(f.generated, true, 'a fact is never flagged generated');
    }
    const ex = catalog.explain(o, 'why this sense here');
    assert.equal(ex.generated, true, 'explanation text carries generated: true');
    assert.ok(typeof ex.text === 'string' && ex.text);
    assert.ok(!('provenance' in ex) || ex.provenance == null, 'generated text carries no dictionary provenance');
    assert.throws(() => impl.asFact({ text: 'x', generated: true, provenance: o.facts[0].provenance }), /generated/u, 'generated text cannot be promoted to a fact');
  });

  await t.test('[4] negative control: the base\'s two producers return different shapes with no entry, reading or sense ids', () => {
    const fixtureRow = indexRows(WORD)[0];
    const legacyRow = { id: WORD, text: WORD, reading: fixtureRow[I.primaryReading], meanings: fixtureRow[I.glosses] };
    const searchRows = legacySearchProducer()([legacyRow], WORD);
    assert.equal(searchRows.length, 1);
    assert.equal(searchRows[0], legacyRow, 'actual legacy search returns the matching input row');
    const card = legacyCardProducer()({ taken: [{ t: 'word', id: WORD, entrySeq: fixtureRow[I.seq], cueReading: fixtureRow[I.primaryReading] }] }, WORD);
    assert.deepEqual(JSON.parse(JSON.stringify(card)), { kind: 'seq', seq: fixtureRow[I.seq], reading: fixtureRow[I.primaryReading] });
    const canonical = catalog.fromCard({ seq: fixtureRow[I.seq], spelling: WORD, reading: fixtureRow[I.primaryReading] });
    assert.ok(canonical.entry && canonical.senses.length && canonical.firstAnswer);
    for (const value of [searchRows[0], card]) {
      for (const key of ['entry', 'senses', 'firstAnswer']) assert.equal(Object.hasOwn(value, key), false, `legacy result lacks ${key}`);
    }
    assert.notDeepEqual(Object.keys(card).sort(), Object.keys(searchRows[0]).sort());
    // a third fixture: a card with a different sense id for the same word must fail the equality assertion
    const row = indexRows(WORD)[0]; const want = expectedIds(row);
    const good = catalog.fromCard({ seq: row[I.seq], spelling: WORD, reading: row[I.primaryReading] });
    const bad = { ...good, senses: good.senses.map((s, i) => (i === 0 ? { ...s, id: senseId({ entry: want.entry, index: 9 }) } : s)) };
    assert.throws(() => assert.deepEqual(bad.senses.map((s) => s.id), want.senses), 'a different sense id for the same word fails');
  });
});
